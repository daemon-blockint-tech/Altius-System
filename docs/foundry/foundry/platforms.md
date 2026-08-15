---
source_url: https://www.palantir.com/docs/foundry/architecture-center/platforms
---

Search

[Palantir](</docs/>)

* Documentation

  * [Documentation](</docs/foundry/>)
  * [Apollo](</docs/apollo/>)
  * [Gotham](</docs/gotham/>)



Search documentation

Search

karat

+

K

[API Reference ↗](</docs/foundry/api-reference/>)Send feedback

en

enjpkrzh

ABXY

ABXYABXYABXYABXYABXYABXY

  * Capabilities

    * [AI Platform (AIP)](</docs/foundry/aip/overview/>)
    * [Data connectivity & integration](</docs/foundry/data-integration/overview/>)
    * [Model connectivity & development](</docs/foundry/model-integration/overview/>)
    * [Ontology building](</docs/foundry/ontology/overview/>)
    * [Developer toolchain](</docs/foundry/dev-toolchain/overview/>)
    * [Use case development](</docs/foundry/app-building/overview/>)
    * [Observability](</docs/foundry/observability/overview/>)
    * [Analytics](</docs/foundry/analytics/overview/>)
    * [Product delivery](</docs/foundry/devops/overview/>)
    * [Security & governance](</docs/foundry/security/overview/>)
    * [Management & enablement](</docs/foundry/administration/overview/>)
  * [Getting started](</docs/foundry/getting-started/overview/>)
  * [Architecture center](</docs/foundry/architecture-center/overview/>)
  * Platform updates

    * [Announcements](</docs/foundry/announcements/>)
    * [Release notes](</docs/foundry/announcements/release-notes/>)



## Architecture center

Hide sidebar

  * [Overview](</docs/foundry/architecture-center/overview/>)
  * [AIP, Foundry, and Apollo](</docs/foundry/architecture-center/platforms/>)
  * [The Ontology system](</docs/foundry/architecture-center/ontology-system/>)
  * [The Multimodal Data Plane](</docs/foundry/architecture-center/multimodal-data-plane/>)
  * [Interoperability](</docs/foundry/architecture-center/interoperability/>)
  * [The Rubix substrate](</docs/foundry/architecture-center/rubix/>)
  * [AIP architecture overview](</docs/foundry/architecture-center/aip-architecture/>)



[Architecture center](</docs/foundry/architecture-center/overview/>)[AIP, Foundry, and Apollo](</docs/foundry/architecture-center/platforms/>)

# [](<#integrated-platforms-aip-foundry-and-apollo>)Integrated platforms: AIP, Foundry, and Apollo

The standard Palantir architecture consists of three integrated platforms: AIP, Foundry, and Apollo.

_Apollo_ is the continuous delivery platform that manages the underlying infrastructure that hosts both Foundry and AIP services. Apollo enables the orchestration of thousands of zero-downtime upgrades across hundreds of services and assets every day.

_Foundry_ is the foundational data operations platform, which provides the core capabilities for data management, logic authoring, Ontology development, analytics, and workflow development.

_AIP_ is the generative AI platform, which provides secure connectivity to large language models through the “ _k_ -LLM” paradigm, a development toolchain for building agents and automations, an array of AI-enabled end user applications, a comprehensive Evals framework for governing AI workflows in production, and more.

![Foundry, AIP, and Apollo make up the Enterprise Operating System.](/docs/resources/foundry/architecture-center/platforms-enterprise-os.png)

## [](<#aip-foundry-and-apollo-an-enterprise-operating-system>)AIP, Foundry, and Apollo: An Enterprise Operating System

The integrated AIP + Foundry + Apollo architecture is designed to function as an Enterprise Operating System.

When taken together, AIP + Foundry can be conceptually mapped into nine capability sets, as shown in the diagram below:

  * The **Ontology Language** , **Ontology Engine** , and **Ontology Toolchain** , which collectively constitute the [Ontology system](</docs/foundry/architecture-center/ontology-system/>);
  * The **Data Services** , **Logic Services** , and **Workflow Services** that power the Ontology system;
  * The **Analytics & Applications**, **Automations** , and a **Product Delivery** toolchain which users can wield to achieve their goals.



Each of these nine capability sets holistically leverage six mesh-wide components: **Storage** , **Compute** , **Networking** , **Security** , **Governance** , and the **Workspace**. All of these components are powered by Apollo.

This comprehensive architecture powers AI-enabled care operations at major hospital systems, integrated network planning for major airlines, electric operations and wildfire response for America’s largest utilities, full spectrum military operations across the United States and allied nations, and thousands of other use cases. To solve the world's hardest problems, Palantir's customers use the Enterprise Operating System to connect data, analytics, and AI with mission-critical operations.

![Illustration showing the 9 capability sets and six lateral categories of AIP+Foundry.](/docs/resources/foundry/architecture-center/platforms-capability-sets-categories.png)

## [](<#unified-security-architecture>)Unified security architecture

A unified security architecture spans all three platforms (AIP, Foundry, and Apollo) in three main spheres: infrastructure security, platform security, and enterprise security.

At an _infrastructure_ level, every component in the Palantir service mesh operates with zero trust (meaning that all elements are access-gated based on identity, device health, and verification) and with an expectation of hostile attacks and the need for autonomous enforcement (for example, through Apollo-mandated encryption, firewalls, and runtime configurations).

At a _platform_ level, both Foundry and AIP provide the full range of controls required to enable trustworthy collaboration. These controls include strict enforcement of access scopes for both humans and agents, granular role-based, marking-based, and purpose-based access controls which connect with automated lineage and auditing, and a range of in-platform applications for interdisciplinary teams.

These foundational controls are extended by _enterprise security_ controls, which enable encryption, audit logging, authorization, and authentication configurations to be deeply integrated with an organization’s existing identity providers, information security tools, and architectural patterns.

![Illustration of platform security architecture: enterprise security, platform security, and infrastructure security.](/docs/resources/foundry/architecture-center/platforms-security-arch.png)

## [](<#extensibility-and-interoperability>)Extensibility and interoperability

The standard AIP + Foundry + Apollo architecture is designed to be extended and deeply integrated with other services and applications.

On the "tactical" level, Palantir's [Compute Modules](</docs/foundry/compute-modules/overview/>) framework allows developers to securely bring their own containers (such as containerized LLMs, optimizers, data processing runtimes, or end-to-end applications) into the Apollo-managed mesh.

A broader example is Palantir’s own defense offerings; their first components were developed before the standard AIP + Foundry + Apollo architecture, but all of the offerings are now completely integrated with the standard architecture. This includes Palantir Gotham's core set of multimodal applications and tools that are powered by the Foundry-managed Ontology.

Other examples can be seen in the Commercial sector, such as Airbus powering an entire Aviation ecosystem (Skywise) through custom offerings that extend the standard architecture, Fujitsu building and delivering a set of specialized agentic applications that use Foundry and AIP’s developer toolchains; or Andretti Racing’s development of a "RaceOS" which connects real-time car performance into a range of rich, AI-powered applications.

The diagram below shows how this works for hospitals building applications on top of the Palantir architecture.

![Illustration of "Palantir for Hospitals" offering.](/docs/resources/foundry/architecture-center/platforms-offering-hospitals.png)

Below is an illustration of Palantir's "Warp Speed", an operating system for manufacturing.

![Illustration of "Palantir Warp Speed" offering.](/docs/resources/foundry/architecture-center/platforms-offering-warp-speed.png)

The defense applications below are built on top of the same core architecture as Palantir's commercial offerings, but specialized for some of the world's most demanding and high-stakes use cases.

![Illustration of "Palantir Defense" offering.](/docs/resources/foundry/architecture-center/platforms-offering-defense.png)

## [](<#pursuing-alpha>)Pursuing alpha

The goal of the standard architecture is deliver non-standard results: extreme differentiation through maintainable customization.

In the best case, a customer organization should be wielding the constellation of Apollo-managed AIP and Foundry services to build the applications, integrations, and fleets of agents that allow them to address their most important problems.

A successful Palantir deployment is one where the enterprise is pursuing "alpha", in investing parlance; in other words, generating outsized returns by building around their differentiation, infusing their particularities into their ontology, and adapting in real-time to complex operational conditions to pursue their strategic objectives.

To continue the analogy, the investing concept of "beta" would be the pursuit of low-hanging fruit, like the basic solutions in a one-size-fits-all SaaS deployment. The wide range of capabilities in Palantir’s architecture can support these use cases, but ideally only as byproducts of pursuing alpha.

![Illustration of how Palantir provides products for "alpha".](/docs/resources/foundry/architecture-center/platforms-products-for-alpha.png)

## [](<#forward-deployed-engineering>)Forward Deployed Engineering

The dynamism of AIP, Foundry, and Apollo collectively reflect a product development paradigm known as Forward Deployed Engineering, which can be thought of as the human equivalent of backpropagation. Palantir engineers are deeply embedded in critical environments around the world, from war zones to factory floors, walking many miles alongside customers, and tirelessly working to build and ship new features. Palantir is driven by the missions of our customers, and at the limit, we see the ambition of every deployment of the standard architecture as becoming the enterprise’s unique, one-of-one, ever-evolving operating system.

[←PREVIOUSOverview](</docs/foundry/architecture-center/overview/>)

[NEXTThe Ontology system→](</docs/foundry/architecture-center/ontology-system/>)

© 2026 Palantir Technologies Inc. All rights reserved.

[Cookies Statement ↗](<https://www.palantir.com/cookie-statement/>)[Privacy Statement ↗](<https://www.palantir.com/privacy-and-security/>)[Terms of Use ↗](<https://www.palantir.com/terms-and-conditions/>)

Cookie Settings

## Contents

  * [Integrated platforms: AIP, Foundry, and Apollo](<#integrated-platforms-aip-foundry-and-apollo>)
    * [AIP, Foundry, and Apollo: An Enterprise Operating System](<#aip-foundry-and-apollo-an-enterprise-operating-system>)
    * [Unified security architecture](<#unified-security-architecture>)
    * [Extensibility and interoperability](<#extensibility-and-interoperability>)
    * [Pursuing alpha](<#pursuing-alpha>)
    * [Forward Deployed Engineering](<#forward-deployed-engineering>)


