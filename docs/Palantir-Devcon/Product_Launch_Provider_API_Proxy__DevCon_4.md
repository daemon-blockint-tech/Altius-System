# Product Launch: Provider API Proxy | DevCon 4

All right. Hi everyone. Uh my name is Austin, product lead for platform security in Foundry and AIP.

>> Uh my name is Gorov. I'm the the product lead for the AI and AI model infra group. Uh my group works on sort of the underlying AI infrastructure that powers a lot of the tools that you're going to see at Defcon uh today and have in the past.

>> Yeah. And I think we're particularly excited to get up and show you guys some of the infrastructure that we're building. It's not very often that we get to talk about this on stage.

Uh, and I think we have a couple of very interesting demos that are going to illustrate how some of the investments we're making at the infrastructure layer, both around security and around making use of LLMs and LLM tooling are going to bubble up into the platform in ways that you'll experience as users, as developers. >> So, to kick things off, um, I think we're going to start by setting the stage by talking through some of the the core concepts that we believe are critical for getting LLMs to production. Uh these are sort of learnings that we've had by doing this process over and over again at different customers.

Um and we'll walk through them briefly. Cool. We'll walk through them briefly um uh one by one and then we'll come back to the security and governance section for for a bit of a drill down.

So uh starting with security and governance. Securing LLMs are hard. They can be very tricky especially when like the the workflows grow from a single nodes to multiple interconnected nodes.

there multiple users, many data sources, each with like different access permissions. You you fundamentally need a system that has rails that empowers good behavior and um automatically figures out what is egregious behavior and enforces compliance to disallow like bad actors or undesirable actions. You also uh want good observability and telemetry like when the nodes become very interconnected, large complex workflows, you have a lot of telemetry that's being generated.

You want a system that automatically aggregates all of this information and surfaces signal around issues that you care about. You don't want to spend a lot of time debugging, reverse engineering what happened, what went wrong. You want to spend that time building.

Um, and when you have something that works, you want to set up monitoring. You want to start defining what a failure looks like for your workflow specifically. Um, once that failure occurs, you want to be alerted on those failures.

You want to go back and look what actually happened. You want to set up evaluations. Somebody asked a question about evaluations earlier.

You want have you want to have eval that very clearly define what are the inputs to your workflows, what are the outputs and then you want to have the ability to audit what that workflow is doing as it goes live so that the evaluations continue to stay in line with your expectations of how that workflow is behaving. Um, you want to have a build system that is flexible. You don't want your engineers and developers to learn a very different way of writing scripts and and and uh pipelines that are batch and then a completely different way of writing interactive workflows.

Like you want to be able to take the learnings from one and apply it to the other. And then as an administrator, you want the ability to understand and manage where your spend is going uh for for LLM. like you want to have the ability to rate limit specific projects and and redirect the the the investments that you're making in LM towards specific areas that you think are valuable for the organization.

You want to have release management, versioning, uh branching uh as we've talked about earlier, you want to have the teams of developers within the organization iterate independently without affecting what is running on production. Like that forces collaboration, which is what you want. And finally, you want a system that scales all the way from data to uh security to the LLMs.

The system should scale as your workflows grows and its needs actually grow with it. Getting all of that right is hard. That was a lot.

Uh we know that because we've been building this for a while. We've been working towards it for for a very long time. These are things that can't be applied after you have a workflow built.

And this has to be innate to the design of the system you're actually building this workflow on. AIP was built using these primitives ground up. Um, and if you build your workflow on it, you can leverage a lot of these things automatically with no additional effort.

Awesome. Yeah, I think something to add to that as well is that many of these principles are not specific to using LLMs. Uh, these things are core to how we've thought about building our software from the very beginning and things that we've baked in.

So if you look at something like data lineage and provenence and how we use that for security uh throughout the platform, that's something that you know we thought about very early on and has been a critical part of how we manage the security and give you the tools you need to sort of own how data is used. With LLMs, it's arguably more important than ever uh to automatically track provenence across the kind of complex and deeply nested chains of agents, functions, automations that you guys are building. So, with that in mind, I'm very excited to announce that we're introducing provenence based security for AIP for all of the logic that you're building uh for operational workflows in AIP.

I'm going to go into detail and show a sort of demo illustrating some of the benefits that this brings. But to set up that demo, I am going to also just talk through a workflow with some slides. Uh the the workflow I have in mind is not specific to AIP.

Uh it's something you could build on other platforms and the problems illustrated could occur uh wherever you're building it. And then once we've walked through that, I'll show some of the unique features and benefits of this provenence space security. So the workflow that I'm uh going to talk about is if you imagine I'm a a manufacturing company and I have suppliers uh and I need to reach out to those suppliers for quotes on raw materials that I'm going to going to buy from them.

So they don't have good APIs for giving me quotes. So I need to interact with them over email. And I want to use LLM to uh to automate that process.

So, first off, uh, I'm going to have one of my developers build a function for drafting emails. That function is going to use some data that I've classified as public, meaning that it's fine to leave my organization and go out to these external parties. Uh, and I'm going to have another developer in parallel working on the other side of the equation, which is actually sending these emails.

They're going to use uh, an external API connection for an email service. uh and that API connection is also marked and certified for public data to leave the platform. So same data I'm using to draft the emails is good to go for my external API.

Finally, I'm going to stitch that together with another function for drafting and sending emails. So it's going to use the other two as tools. First, it's going to maybe iterate through a few drafts.

When it's ready to go, it's going to send the email externally. And as described, that workflow is going to work great. It's straightforward.

It's simple. I'm using the data appropriately for the purpose that I want to use it for. Now, if you've built anything, uh, you're probably familiar with somebody showing up after the fact and modifying things in a way that doesn't account for the initial assumptions.

So, what I want you to imagine here is a few months down the line, developer shows up, they find this draft email function and they start modifying it. And maybe, you know, based on the name says draft email, they don't realize it's actually used to send emails. They think it's just for drafts and they want to make those drafts better by incorporating some sensitive internal data.

So they start modifying it. That works fine in isolation. But as that sensitive internal data propagates through the system, I think it should be obvious why that's going to become problematic when the latest version of draft email starts being used in the draft and send email function.

And what you would want out of the platform is to actually detect and and block such situations. And that is exactly the feature that I'm about to show you. And AIP will track the lineage of how data is being used through not just a small graph of uh interconnected functions and agents like I've shown here, but through the more realistic graphs that you've seen in the earlier demos and that I'm sure you've experienced as users of the platform.

Uh, all right. So, let's switch over to the to the computer. Uh, and so what I've got here is a solution design illustrating the exact workflow that I just showed on the slides.

We've got our send email function that's implemented as a Python function. It's using an external API connection that's marked as safe for public data. Uh, and I've got an AIP logic function that is drafting my emails by querying some ontology data containing vendor quote request data and that data is marked as public as mentioned.

Finally, we have another AIP logic function using the previous two as tools, uh, stitching them together to draft and send an email. So, what I'm going to do is jump into this draft email function and be that developer who's going in and modifying it to access the sensitive internal data. So, when I come in here, I can see that my function is currently querying vendor quotes request data and I'm going to give it access to some vendor data that I have available, which is sensitive internal.

My vendor data in this case contains some internal scores that I keep about how good these vendors are performing and sort of some internal information that I wouldn't want to share with them directly. I'm also going to update the prompt uh to let my agent know that it can use that information to draft a good email. And I'm just going to quickly preview it uh to see that it drafts uh an improved email.

All right, we see the email coming through right here. Uh, and in isolation, as mentioned before, this is completely fine. Uh, we're not yet using it downstream.

And so, it's expected that this would work and I'd be able to iterate on on my, uh, draft email function. So, this looks good. Uh, I like the email.

I'm just going to go ahead and publish this. So, we're on version 127, and I'm going to go back and open up this draft and send email function. So, I'm I'm going to manually bump draft and send email to start using this new draft email function.

And we're going to see what happens when I do that. So, in here, I'm going to start using the latest version. And when I go to preview this, what I want to happen is that the platform will stop me because this could actually end up sending data externally.

And we see that it does. So, this is a new error. You guys probably haven't seen this error before.

Uh, working on infrastructure, we love we love detailed errors. Uh so in this case I'm getting permission denied based on export marking uh validation. So this means that it's actually traversed upstream to realize that somewhere upstream of this draft email function I'm bringing in sensitive data and on the other side somewhere upstream of the send email function I'm using a connection that isn't appropriate for that uh classification of data and it's going to block me from doing this.

It's also going to block me from from publishing this function with a very similar error. Uh, and this is just one of the the protections that we can build on top of provenencebased security. I'll talk a little bit more about what some of the more future-looking things are, but for now, let's switch back over and Garav is going to illustrate how we're bringing these kind of infrastructure improvements to a much broader range of open-source uh, LLM tooling.

>> Thank you, Austin. Okay, so uh Austin talked through some of the new things that we're building around provenence driven security. Uh I'm going to talk a bit about how we're expanding the scope of what you can do with LLMs in the platform.

One of the requests we commonly get from customers is that they want to use more open source tools. They want to use open source tools um to iterate outside the platform but also eventually bring their workflows within the platform. There's a lot of innovation happening right now in the industry.

It's a very exciting time. lots of new tools uh are being released basically daily. Um and we want our customers to leverage that uh innovation.

We want them to not have to choose between AIP or or like using open source tools. So one of the things that we're introducing today is the the provider API proxies and our hope is that these allow um customers, developers to be able to use any open source tool, any open source library, the latest and the bleeding edge of what is being innovated outside. um bring that into the platform and then just use it out of the box.

Uh what it is is fundamentally uh it's a wire compatible API for some of the the frontier models that people are most familiar with. So OpenAI, Enthropic um and then like I said earlier any library that you find and want to use with those models, you should be able to just like bring that into the platform and then uh start using it for them. So how does that work?

We talked about local app development. it's it's typically external systems or or personal laptops where people are pointing directly to the model provider endpoints. Uh you can now push that to the the compute orchestration layer.

So compute modules, functions, transforms really anywhere within the AIP platform where you write code. Now you have the ability to point that code, TypeScript, Python uh towards the AIP model service, which is the service that exposes these API endpoints. Um and then really sort of the requests that you make through those libraries will then be fied out to one of the many baler model hosting hubs that we have distributed across the globe.

So these model hosting hubs uh I think they're currently 15 or 16 in number and are growing are separated by regional and u data sort of locality constraints. So there's a lot of intelligence we're building into this this layer of the the platform infrastructure. So if you have specific georestriction requirements or or specific data locality requirements, the model service will intelligently figure out where your data should be going uh and then route it to the right place to make sure you remain compliant.

Um additionally, we're also building a lot of like fault tolerance and scale into this layer. So if there's an outage at a specific model or a specific model provider, if we have a better or or more available sort of uptime uh model provider somewhere which is also compliant, the system will automatically route you towards that uh available to to make sure that your customers don't actually uh the users of the workflow don't actually feel the the downtime. Um hopefully this happens transparently so you never have to find out.

Um cool. So, we're going to jump into a brief demo and switch back to the laptop. And for the purpose of the demo, I'm going to assume the role of a developer in one of the teams that Austin talked about.

So, if you recall, he he called about there's three different teams. One of them is is building the the draft email AIP logic. Another one is working on the send email function.

I'm going to assume the role of a developer who wants to use Procode tools to to draft an email uh and then embed that into this workflow. Um, I'm very excited about the the open source tools that that are in the industry and I've heard the name Pyantic a lot. So, I'm curious if I can use Spideyantic to write a Python function.

Uh, let's say using the entropic model. So, I'm going to go ahead and Google it. Uh, and see what I can find.

So, let's see. Pantic. Enthropic.

[sighs] Looks like they have something. Um, cool. So, this seems interesting.

This is a very simple interface. simple Python imports and uh just a single string to actually initialize a model. Um let's see if I can actually pull that into the platform.

So I have I have a shim of a function here just for the demo where uh I'm just going to use this to actually build that uh workflow out. And since this is a demo, I've spent some time building the script out using pyantic earlier. So let me let me jump to GitHub where I have that script.

Cool. So this this looks very similar to what we saw on the website. We're bringing in pyantic model inputs and then creating a client very similar to what we saw um on the documentation.

There's some subtle differences which I'll explain in a second. Uh those are specific to how we actually route the request. So let's see if you can copy this out and then go to the function.

And then I'm just going to paste this here. a little bit of refactor and then I have a bit of a few lines of code which as they run I'll explain what they're actually doing. Cool.

All right. Looks like it compiled. I'm going to pick a coach request and vendor object and then run it.

So the the things that we actually picked up from the this the second um uh file essentially are a couple of helper functions that are pulling in the host name of the AIP stack and the token. These are effectively basically the the base URL of of the the proxy APIs and the authorization to hit the AIP model service. This is fundamentally all you need.

Most open source tools allow you to swap these out seamlessly. And once you do that, you should be able to hit uh the underlying proxy. So the script that I have is going to run an agentic loop.

It's going to use the the objects that I have uh imported as a reference and then looks like it actually finished. Cool. So it generated an email for me.

I'll validate the structure, make sure it actually looks good. But what we have here now is a Python function that we pulled a library from uh the internet. We looked at the documentation.

We built out a script and mostly just copy pasted the codes with with a few subtle changes. Um and we have a function that we can use anywhere in the platform in pipeline builder in workshop. Um mostly anything.

Um, one of the things that Austin pointed out earlier was that we have an object here, vendor vendor info object, which if you recall, um, is a sensitive internal object since this is right now a function can be used in any of the workflows. Uh, for most internal users, this is okay. But you want a system that detects when this function is being used in the context of exporting data.

So let me see if I can copy this function signature which I have published from before and then apply it to the draft and send email AIP logic that Austin had from earlier. Cool. Cool.

So when I run this, what I would expect is that AIP logic would automatically figure out the dependencies. This new function is bringing in new dependencies, but be able to traverse that all the way to figure out what the inputs are to that specific function and then identify that it is bringing in sensitive uh markings and then block this connection. [clears throat] Cool.

So we saw this expo tonight error earlier. seems like even if I change the the underlying sort of dependency to a procode tool, we're still intelligently able to navigate the the the providence and the the dependency chain to figure out something sensitive is being exported and block it. So to emphasize what we were able to do quickly, we were able to pull in an open source library releasing basically every day.

We were able to build on top of it uh very quickly with very minor modifications uh and then leverage some of the security guardrails that AIP has uh built into it to inject that into a workflow and then still sort of leverage the the the bleeding edge of what's possible. Cool. We'll switch back to the slides.

Cool. Uh we're very excited about this capability. People have been asking us about this for a while.

So I'm I I'm very curious to see how our customers use it, how our developers sort of leverage it, what kind of agentic tools they want to build. Um we're expanding support to other providers soon. Currently we support OpenAI and Anthropic.

Um if you have interest in specific providers, please come and talk to me after. We're adding support for external models. We want to improve the integration story there and making a ton more investments in like observability, scale, fall tolerance.

Awesome. >> Yeah. Uh and on the security front, I just want to emphasize that export controls is not the only feature that we get from this.

There are a bunch of features that are going to be coming down the pipe. Uh some of which you'll see, some of which will just be implicit and hopefully you don't have to think about. But in the end, I think a lot of the security invest in investments we're making are not only uh to protect how human developers are using the platform, but also these are really important infrastructure level controls that you want when you're unleashing AI to be the developer within your organization.

You want to make sure that AI is building in a way that's compliant with your governance constraints and the sort of intended use of your data. Uh and that's something that we're building directly into the infrastructure. So you don't have to trust the LLMs to get it right every time.

Uh I think finally, you know, we have this philosophy that you you don't need to make a trade-off. Uh and I think early on in Palunteer history, this was really like you don't need to make a trade-off between uh security and privacy. And in the world of LLMs and AIP, we want to make sure that you don't have to make a trade-off between really accelerated adoption of all of these great AI tools and the kind of security uh and deployability enterprise readiness of the workflows that you're building.

Uh I think we can leave it there and we might have time for one question, but we're a little bit behind schedule. No questions. Okay.

If you want questions, come talk to us after. Uh we'll be here the next two days. Cool.

Thanks a lot.