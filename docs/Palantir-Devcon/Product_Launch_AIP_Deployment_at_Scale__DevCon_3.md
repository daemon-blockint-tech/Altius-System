# Product Launch: AIP Deployment at Scale | DevCon 3

Hello. Thank you. Thank you Enrag for the introduction.

Um I am Ciney. Uh this is Raj. We work on the marketplace team.

We are the team that's responsible for helping you scale the deployment of your workflows. You might have encountered our products using DevOps for release management. Um or you might be in Canary sessions today and tomorrow installing from marketplace.

Today we are going to show you some new product features and also give you a preview of the latest in B2B product delivery. So here is what you can expect in the next 15 minutes. Um we're going to start off with a bit of motivation um when and why you should care about DevOps and product distribution.

Next, we will do a live demo of the latest in B2B product delivery. Uh, we'll then zoom in and highlight a few features from the demo. And then finally, we'll end with a recap of what's coming next and some time for a Q&A.

So, starting off with a bit of motivation. Um, as you've seen in the pri demos prior, Foundry is incredibly good at zero to one. You can build an entire end-to-end workflow in a matter of hours as you will do in the hackathon.

Um, but as builders, you know that your application building doesn't stop when you have your first set of users. You have bugs to fix. You have features to add.

Maybe you even have migrations to run. How do you do all of that without disrupting your users or compromising the stability of your production workflows? So, we see workflow building as a journey through several different levels.

I'm going to call it out up front that you don't have to go through all the levels. We've seen plenty of incredibly impactful workflows at zero and one. Um, but we just want to show you what is possible within the platform today.

So, let's walk through this journey together. Starting at level zero, um, you just have one production environment and you're making edits straight and prod. Uh, you don't have users yet.

um and you're just trying to move fast, break things, and get it done. This is probably what you'll be doing in the hackathon and or in the pilot phases of your projects. Now, moving on to level one, you still have one production environment, but you're using branching to manage your changes.

Maybe because you want more stability or maybe because you have more devs working together. Branching comes very naturally to devs. Um when you create a branch, you get a mini environment to yourself and you can make crosscutting changes across pipeline ontology workshop and have all of them reviewed and tested by someone else before you merge it into your production environment at once.

Now moving beyond branching to level two, you start seeing more separation between dev and prod. You set up different environments and you use DevOps to promote releases between them. This is useful if you want to dev against different data sources um or if you want isolated test environments.

Um it is more maintenance and setup than just using branching alone. But it gives you an additional level of stability and release management for your workflows that need it. And finally on to level three um product delivery.

Instead of just going from dev to prod, you now have many production environments. You're not just building a workflow. You are delivering a product to multiple customers.

So, traditionally we've thought about software development as applications and services written in code. But when you're building in Foundry, you are also building software. You are encoding business logic.

You are automating processes and you're delivering value just like any other coded application. And so in level three, we're building the infrastructure that lets you distribute and deploy your workflows into multiple production environments like any other software product. Um we'll now hand it over to Raj to tell us more.

Thank you. So uh switching over, deploying products into desperate environments is something Palunt has had a lot of experience with using Apollo which is a continuous delivery platform. It's what enables us to deploy software beyond the public cloud and going all the way into private networks, classified environments, and even disconnected environments like satellites and trucks.

Using multiple production environments usually seems counterintuitive, especially if you're coming from the B2C world where you have one instance that is serving all your customers. However, when you're working with institutions that have a lot of requirements such as where their data lives, etc., be it geographically the networks they're a part of or other things you want to be able to deliver your products where your customers need it to be and for this we are bringing the power of Apollo to the products that you built in foundry the products that can be built with all the tools you have been seeing today from the OSDK and ontogy as code through to aft and other things in the ontology and all of it is something that you build once and deploy it wherever you need to go sweet and let's jump back for the demo and hand it off to Vinnie, thank you. Cool.

Okay, starting with the demo. Um, let's see. Okay, can we move over to my screen?

Cool. Um, so here is the application that we are going to be delivering. It is a transcription widget uh with a bit of a twist.

It records what you're saying in real time. Um, but it also has a help from a domain specific corpus. Um, so as you can see, I have trained it on terms uh related to AIP and uh DevCon.

And so I can say something like, hey, remind me to learn more about AI FDE and the latest features in DevOps. Oh no, I didn't quite transcribe it very well. Oops.

Um, but it did pick out AFD. Um, and then I can click on it. Um, and it gives me a definition.

Uh, it might have picked this up, but this should have. Um, cool. Okay.

So, but you can imagine, let's go back to AFD. Um, so you can imagine how this is useful in scenarios where precision and context is critical and where you might be talking about vocabulary and acronyms that a generic transcription service might not be able to pick up. Uh, so we're building this app last week and Raj saw it and thought it would be make uh it'll be really useful for his use case as well.

Um, so I'll hand it over to Raj to show you how he has customized this product for his own use case and then afterwards we'll walk through the steps to deploy a change from my dev environment into his production environment. Sweet. Uh, switching laptops.

So what I did here is instead of using it for acronyms, I decided I actually want it to be a cheat sheet as I'm throwing out ideas for how I want to edit photos and also dots on like okay this are the set of steps I need to do to actually go through the process of it. And what we find is that it gets pretty good at being able to identify these things. So I'm repurposing the application that was built for a completely different use case but using the same building blocks.

So I can just go I took a photo of the Golden Gate Bridge and this was done with extremely warm tones. Maybe I can go for a vintage effect. I'm not sure.

Just throwing ideas out there. It's something that will go on and it'll transcribe it and suggest things that I can do to actually get um yeah like steps that I should go through to edit the photos as I wanted to. So I can just catalog my ideas there and get back to it rather than actually iterating through this whole process.

And pretty convenient except I wish it was in dark mode because it does not go with my laptop. Oh, dark mode. Um, luckily, um, I have read Raj's mind and have implemented his feature request.

Um, and so, switching back to my laptop, um, now you're looking at my dev environment. Um, you can see dev in the URL. Um, and this is a slightly different version of the application.

It now has a dark mode toggle. Um, so I can click on it and switch it and enable dark mode. You can see I've also updated the CSS a little bit and so it looks um, all of the other screens look nice as well.

Um, and so this is a change that I've made in dev. I have already cut a new uh tagged bit. And now let's get this release onto Roger's environment.

Um, can we switch over to slides for a sec? Cool. Okay.

Um, so for this next part of the demo, we're going to be going between several different screens. And so before we do that, um, I'll walk you through an overview of what we're going to do. Um, and then we'll actually show this in action.

Um so here's a preview of the changes going in sequence um in from left to right on the diagram. First we'll be creating a new release in DevOps and then we'll verify it in my staging environment. Um notice that dev and staging are both environments that I have access to.

Um and then we'll see the release published into an Apollo hub. And then finally, the Apollo hub is connected to multiple downstream environments, including Roger's production environment where the updated app should show up. Now, switching back to my computer.

So, I've already implemented a feature, but a release has not been made yet. And so, starting here in my dev environment, um I can uh and also I have already merged my code. And so to start creating a new release um I go to DevOps and hit start a new version.

Now it is in the background. This is you know taking my the latest from my code repository and then creating a uh transferable version of that resource. Um if you're using DevOps today this might look a little different to you.

Um this is actually the new packaging UI that we will be releasing to enterprise users in July. Um as you can see it is a lot more streamlined and one of the new features within this UI is that I can now group my inputs by linked products. Um I have a lot of inputs in this case.

So the application is the product that I'm trying to package and release. Um but this product has a lot of inputs because it relies on ontology entities and functions. Um and so on the left hand side you can see all of them as inputs.

Um, and what I could do is group it by linked products to make sure that all of my inputs um will actually be satisfied by my ontology. And in this case, you can see they are all um and so I am good to publish. Um, so I can say uh dark mode in my change log and then go ahead with the publish.

Now if you give it a sec, now we have version 22. Um, and so this is good to go. Uh once I have a new version of my product, the first thing I want to do is to verify in my staging environment because you know you just want to make sure it works.

It doesn't like you know uh mess up any of your data. And so to get to my staging environment um I can simply go to the environments tab in my in dev devops. Uh and so you can see uh I have a installation in my staging environment and it there is an upgrade available.

Um, I can click into it and it is now upgra updating automatically updating to the version that I've just released. Um, this should go through relatively quickly. I can follow.

Ah, it is done. And if I take a look at the job history, you can see it is successful. Uh, and so if I just go back to my staging uh, application that this was what I was first demoing on.

Um, I can just and you can see there is no dark mode yet. Uh but if I give it a refresh, dark mode should now show up. Hooray.

Uh there is now dark mode. I should test it and just make want to make sure you know audio recording is still working. And it looks like it is okay.

Now it is good to go. Uh so once it looks good on staging, I am ready to publish it into Apollo. Now let's take a look in Apollo.

Uh I already have Apollo pulled up. Um, and I can simply search for my product. Um, it is called Scribbler app.

And you can see that the new version that we've just cut is already in Apollo. Um, you can also see it has already completed its security scan that Raj will talk more about in a sec. Um, and it's also being evaluated for promotion.

Um, you can also see that there are a few options that you have um, within Apollo to manage the release of this version. uh I am able to manually promote it through pipelines or I can recall it. And then there are a few more options in the uh page as well.

Um and so now that this release is in Paulo, we'll have Raj talk us through how it looks like on his environment. Sweet. Uh jumping back to my screen.

So this installed using a marketplace product. I'm just going to refresh it and hope that it's shown up, but I'm not sure. Oh, okay.

It already has. So, I want to walk through what is uh we should switch to Roger's screen. Yeah.

Oops. Yeah, I accidentally just refreshed it so we don't get the old version back. But yeah, so hit refresh and this showed up.

But I want to show what's happened in the background. So I had version 21 installed which was what we were using in the past. But on refreshing we see that the upgrade to version 22 has evidently gone through as we saw in the app.

And what it's done in the background is that Foundry has triggered a job in the background similar to what we saw in the staging environment which has taken us from version 21 to 22 and picked up the changes in here. And this something that should just happen autonomously and you don't need to be thinking about deployment. It should just get delivered for you.

And so fixing the last problem, let's go back to dark mode. Great. Uh back to Sydney to talk through some of the features.

Cool. Okay. Um, now back to slides.

Okay, so that was the endto-end demo. We will now highlight a few of the new features you've seen and also talk through what's coming next. So, first off, the most exciting change for those of you who are using DevOps today.

We hear your feedback. Packaging is too many clicks. We It feels slow.

It feels clunky. So, we have completely revamped the packaging experience based on your feedback. Um, packaging is now faster than ever with much fewer clicks.

Um, in this example, I am packaging a new version of my product. And as you can see, I can do the same operation in about half the number of clicks and in a third of the time. Um, it's an incredible uh improvement to usability and productivity.

And we're really excited to have you try it out. Uh, this is coming to enterprise users in July, but if you have a dev tier enrollment, you can try it out today. Um, and also if you are, you know, after your hackathon, want to package up your products on the Devcon stack, you can also try out this new experience.

The second improvement to DevOps that I want to touch on is the environments tab for release management. Um, if you were here at the last DevCon, you would have heard us tease this. This is now generally available.

It makes managing installations across environments so much easier and so much more legible. So that's all the exciting stuff in DevOps. I will now hand it over to Raj to talk about products distribution via Apollo.

Thanks Siri. And as I've heard from Zini earlier, when you're building a foundry, you are building software and security and trust are critical here. You want every component to be verified whether through code review, repository governance or automated code scanning.

While these aren't always the things you want to be focusing on as builders, they're essential for shipping secure compliance software. Our goal is to make these features available for you and in Foundry for all the products you build while staying out of your way. We have introduced tools to build um to manage your project security declaratively introduce code scanning and enable binary signing to prevent tampering of any product bundles built within the platform.

And looking ahead, we want to start attesting to these security guarantees when publishing a product and embedding them as part of the supply chain security manifest so that it can be um picked up by downstream uh downstream systems for verification. In short, we want you to focus on building the product and Foundry will take care of helping you ship secure software by default. And once I'm actually done building it, you want to step over to installation.

Deploying it smoothly into each of your customers environments. Marketplace Apollo integration really streams stream streamlines this process and handles dependencies, configuration and more. And it pretty much ensures seamless installations every single time.

And as you start to scale beyond the first installation, you might have multiple customers and these might span cloud environments, classified networks or even edge devices. This starts to get really over starts to get super overwhelming and this where Apollo comes in and really starts to shine because it makes the management of multi-environment systems a complete breeze as it offers release channels, promotion pipelines and other features which gets convenient when you have thousand or more installations as we do for some of our products. These are capabilities that we have built with over a decade of operating experience and we're getting it out of the box for you when you're using Apollo.

this. So things in the previous slide and this are things that we are iterating on in a close beta with a few customers right now and stay tuned for updates. Uh back to Zeni.

Oh, thank you Raj. Um so to wrap up this presentation, here is a preview of what's coming next. Um and a few things on the horizon that didn't quite make it into the demo, but we're super excited about.

Um as I've mentioned, patching V2 is releasing in July. Um, we're also adding the ability to configure default values in DevOps. This means fewer configurations on installation and more automatic upgrades.

Uh, we're also enabling automated installs and upgrades for Apollo. We're increasing we're working on increasing product size limits. We're enabling crossdraw linked products.

Um, and finally, we're working on public APIs for DevOps so you can manage upgrades and installations as part of your own CI/CD setup. That is all of our prepared content. Time for a Q&A.

Thank you.