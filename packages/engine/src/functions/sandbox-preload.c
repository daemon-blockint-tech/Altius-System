/*
 * sandbox-preload.c — LD_PRELOAD library that enforces SandboxProfile
 * restrictions on Linux.
 *
 * Intercepts socket(2), connect(2), open(2), and openat(2) syscalls
 * and rejects calls that violate the sandbox config.
 *
 * The config is read from the ALTius_SANDBOX_CONFIG env var, which
 * points to a JSON file with the sandbox rules.
 *
 * Compile with:
 *   cc -shared -fPIC -o sandbox-preload.so sandbox-preload.c -ldl
 *
 * This is a best-effort syscall filter. It does not prevent:
 *   - ptrace-based escapes
 *   - kernel exploits
 *   - /proc/self/mem tricks
 *
 * For untrusted third-party code, use container-based isolation
 * (gVisor, Firecracker) on top of this.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <errno.h>

/* Real syscall function pointers (resolved via dlsym) */
static int (*real_socket)(int, int, int) = NULL;
static int (*real_connect)(int, const struct sockaddr *, socklen_t) = NULL;
static int (*real_open)(const char *, int, ...) = NULL;
static int (*real_openat)(int, const char *, int, ...) = NULL;

/* Simple config: just a flag for whether network is allowed at all */
static int network_allowed = 0;
static int config_loaded = 0;

static void load_config(void) {
    if (config_loaded) return;
    config_loaded = 1;

    const char *config_path = getenv("ALTius_SANDBOX_CONFIG");
    if (!config_path) {
        /* No config → deny everything */
        network_allowed = 0;
        return;
    }

    /* Minimal JSON parse: look for "network":[...] with entries */
    FILE *f = fopen(config_path, "r");
    if (!f) {
        network_allowed = 0;
        return;
    }

    char buf[8192];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    buf[n] = '\0';
    fclose(f);

    /* If the network array is non-empty, allow network */
    if (strstr(buf, "\"network\":[") && !strstr(buf, "\"network\":[]")) {
        network_allowed = 1;
    }
}

__attribute__((constructor))
static void init(void) {
    real_socket = dlsym(RTLD_NEXT, "socket");
    real_connect = dlsym(RTLD_NEXT, "connect");
    real_open = dlsym(RTLD_NEXT, "open");
    real_openat = dlsym(RTLD_NEXT, "openat");
    load_config();
}

/* Intercept socket(2): deny if network is not allowed */
int socket(int domain, int type, int protocol) {
    load_config();
    if (!network_allowed && (domain == AF_INET || domain == AF_INET6 || domain == AF_UNIX)) {
        errno = EACCES;
        return -1;
    }
    return real_socket(domain, type, protocol);
}

/* Intercept connect(2): deny if network is not allowed */
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    load_config();
    if (!network_allowed) {
        errno = EACCES;
        return -1;
    }
    return real_connect(sockfd, addr, addrlen);
}

/* Intercept open(2): restrict to allowed paths */
int open(const char *pathname, int flags, ...) {
    load_config();
    if (!real_open) real_open = dlsym(RTLD_NEXT, "open");

    mode_t mode = 0;
    if (flags & O_CREAT) {
        va_list args;
        va_start(args, flags);
        mode = va_arg(args, mode_t);
        va_end(args);
    }

    /* Always allow the temp dir */
    const char *temp = getenv("ALTius_SANDBOX_TEMP");
    if (temp && strncmp(pathname, temp, strlen(temp)) == 0) {
        return real_open(pathname, flags, mode);
    }

    /* Always allow /tmp */
    if (strncmp(pathname, "/tmp/", 5) == 0 || strcmp(pathname, "/tmp") == 0) {
        return real_open(pathname, flags, mode);
    }

    /* Always allow reads from standard library paths */
    if (!(flags & (O_WRONLY | O_RDWR | O_CREAT | O_TRUNC))) {
        if (strncmp(pathname, "/usr/lib/", 9) == 0 ||
            strncmp(pathname, "/lib/", 5) == 0 ||
            strncmp(pathname, "/usr/share/", 11) == 0 ||
            strncmp(pathname, "/etc/ld-", 8) == 0) {
            return real_open(pathname, flags, mode);
        }
    }

    /* Deny everything else */
    errno = EACCES;
    return -1;
}

/* Intercept openat(2): same logic as open */
int openat(int dirfd, const char *pathname, int flags, ...) {
    load_config();
    if (!real_openat) real_openat = dlsym(RTLD_NEXT, "openat");

    mode_t mode = 0;
    if (flags & O_CREAT) {
        va_list args;
        va_start(args, flags);
        mode = va_arg(args, mode_t);
        va_end(args);
    }

    const char *temp = getenv("ALTius_SANDBOX_TEMP");
    if (temp && strncmp(pathname, temp, strlen(temp)) == 0) {
        return real_openat(dirfd, pathname, flags, mode);
    }

    if (strncmp(pathname, "/tmp/", 5) == 0 || strcmp(pathname, "/tmp") == 0) {
        return real_openat(dirfd, pathname, flags, mode);
    }

    if (!(flags & (O_WRONLY | O_RDWR | O_CREAT | O_TRUNC))) {
        if (strncmp(pathname, "/usr/lib/", 9) == 0 ||
            strncmp(pathname, "/lib/", 5) == 0 ||
            strncmp(pathname, "/usr/share/", 11) == 0) {
            return real_openat(dirfd, pathname, flags, mode);
        }
    }

    errno = EACCES;
    return -1;
}
