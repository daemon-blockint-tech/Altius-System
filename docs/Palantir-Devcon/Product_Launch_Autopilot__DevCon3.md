# Product Launch: Autopilot | DevCon3

Hello, we're here to talk about autopilot. Um to do a quick introduction, we started this year and we were uh talking to users about exactly what we needed to achieve within the platform to make these workflows around automations and actually working around the ontology easier and more clear. Uh I think one thing that became very clear to us as we started to look at the product offering we had was that we had a product gap.

There was something that we weren't giving you when it came to autonomy at scale and doing automation itself at scale. Um and that's hopefully what we're going to introduce with autopilot. So uh we're going to start by talking through this concept of an aentic state machine.

So what it looks like when you start bringing these uh automations to scale in the way that Ace was describing. Uh Anick's going to do a live demo of autopilot and then we'll we'll go through takeaways. So by way of introduction, I'm Jegg.

What is it? What are we trying to solve? If you look back maybe two years ago, we were talking about bringing LLMs to the ontology and it was for very specific tasks.

We might look at summarization. We might look at categorization and we're literally just starting to have the infancy of how can I do optimizations today with large language models. Then with products like automate, we started seeing how we can do event driven automation on our ontology.

So if something changes in my world in my described environment, then can I then trigger these automations on top? Can I trigger these LLMs? And the thing that we're now seeing today is how that has scaled to an immense level where people and yourself included are building these enormous what we call agentic state machines.

So you have events triggering other events creating these ginormous chains of uh automations kicking each other off until huge processes in your organization are actually being run directly using LLMs in a safe environment. So the one thing we did realize is once you get to this scale, if serendipity is on your side, then maybe you can automate your whole business. But in reality, what you're running is a multiplayer organism of humans and AI running against your organization.

And you need to be able to understand the kinetics of that and have a new lens on the ontology to be able to actually understand, okay, so where should a human be? Where should an AI agent be brought in? And that's what we've brought to life with autopilot, a new lens on uh the ontology and something we've been describing as an agentic IDE.

So in the same way you use an IDE to help you refactor, manage, observe code and actually work on how you do incremental change and productionization. Our IDE in autopilot is how do you refactor your organization? How do you look at optimizations in that world?

So to bring this to reality, uh I'm going to pass over to Anik who's going to do a demo of the current state and autopilot. So if we could swap over to the laptop, that'd be great. Cool.

Uh yeah, so let's start with uh some of the tools that we currently offer in Foundry for developing some of those agents for doing singular tasks. So for the purpose of this whole demo, I'm going to play the role of a marketing manager who is in charge of these product campaigns and wants to inject AI into the workflow to generate campaign emails, social media drafts, email blasts, that sort of thing. So here I have AIP logic.

AIP logic is a tool that hopefully many of you have used or know about, but it is a tool which lets me kind of use the entire ontology to generate these uh single agents to do a specific task. So in this case I have uh an AIP logic function which is going to help me draft emails. I can use context from the rest of the ontology.

So in this case I can look at campaign emails that have been previously approved. I can inject that into context. I can then actually debug uh my uh logic function.

I can see what the LLM gets for a given product campaign. I can see exactly what it receives, exactly what it gives me back and the steps it takes. I can then set up evaluation cases.

So I can set up these sort of probabilistic test cases which give me confidence in my logic function as I develop it. And finally in just a few clicks I can create a new automation. This is an automation that will automatically run on every new product campaign and then draft that email for me and write it back into the ontology.

So with with a few clicks I've been able to kind of develop confidence in that agent. uh and then deploy it into production. And that's great for developing these singular agents that do these tasks.

But like Jake mentioned, what we've seen kind of all of you build really is these much more complex systems uh composed of lots of automations, lots of functions, lots of agents, etc. So let me hop over to this view. This is workflow builder.

This is an application which lets me see all of the resources in my workflow. So in this case, I have an extension of that logic function that I just showed you where I've got a bunch of different automations doing a bunch of different things. So in this case, I have some automations for creating campaign emails, uh managing rejections and approvals.

I've got a feedback loop in here where the AI kind of tweaks uh its own outputs. And I have a bunch of different functions uh and agents and object types and language models in the mix. Obviously, this view is kind of confusing, right?

It's hard to know exactly what's going on in this system. Uh, it's great for showing me how all the resources are connected, but what I really want to know is how is my data actually moving through the system? How is it moving through all of the different states in my system?

And that's exactly why we built autopilot. So I'm going to jump into autopilot now which is a place where I can actually debug uh monitor the performance and tweak my system at large. So just to orient ourselves on the left hand side we have a file tree which kind of uh shows all of the entities in my system and how they're nested within each other.

And on the right hand side I have all my data and I can see in real time how that data is moving through the system with each of these columns kind of representing a single state in my agendic state machine. If I hop over to the system preview I can see a bird's eye view of how data is going to or has moved through my system. So I can see here I have some functions which create these product campaigns.

I then have automations which review them. I have a rejection manager which kind of decides whether or not the the LLM generated things were good enough. And then I have some more subsystems for again drafting those emails, drafting social media posts, and then finally kind of actually sending out those emails after they've been approved.

Cool. So, this is great for giving me a bird's eye view, but I actually want to dig in now and debug how my system's performing. I want to make sure things are things are going well and see what I can improve.

One example of a thing I might want to improve is, well, if my AI is rejecting email drafts a bunch of times, I kind of want to see exactly what it's doing and how I can improve that. So, one of the things we've built out in autopilot is the ability to look at the entire life cycle of your object instances, in this case, the product campaign, from when they are created to how the AI is interacting with it. So in this case, I can see I've got a campaign for a product called Capture Next.

This is created at  p.m. on 22nd. And I can see it's been rejected a bunch of times.

So here I can see the entire timeline of that view. And once I look into the details, I can see actually exactly what the LLM has been doing and detailed telemetry over the execution of this automation. I'm not going to dig in too much to the telemetry here.

We've got a bunch of other folks who are going to show all of the features of some of this work and how it is interacting across the platform. But here I can see I've got an automation that triggers triggers a function triggers another function. It sends uh a large prompt to the LLM and then I can see actually exactly how much that uh LM call cost as well as why it was rejected and the feedback that was generated on the trace flame graph here.

I can also see exactly how long every uh substep took and then optimize performance based on that. So from here I might have gained some insights that let me actually tweak what this particular function does. But importantly I can also see all of the other traces over time to see exactly exactly what the LLM is doing at any step of the way of the life of the life cycle of this particular product campaign.

Cool. So in this system I've got a lot of automations but obviously like A and J mentioned humans are super important too. So I'm going to hand over to Je to talk a little bit about how we're in uh implementing humans into the system.

Yes thank you. So to Ann's point humans are still important in the world. Um as we mentioned you're not going to oneshot replace all of your humans with automations nor should you.

uh we want to be supporting you both with the workflows that you have in uh your automates but also where humans are in your process. So in this example that an has on the screen uh we actually have a workshop application where humans are managing certain campaign rejections. So if we look at this workshop application you can see uh where our automations are actually making mistakes where I potentially should be bringing evals in.

You can see that one of the review states was quotation mark done. If you've been using LLMs, you've probably experienced this at some point where the output hasn't been right. But what's very clear to us is that humans are still very much in the system.

And when we're talking about optimization of a system like this, it's great for us to be able to tell you like, oh, this is how you improve your individual automate, but at a broader level, we also want to tell you in your process, what else should you be paying attention to? How can you save time in these workflows? So in the top right of the screen we can see two actions are detected and with the action edit logs we actually do some uh analysis on top of that in the background to see okay so for all the automates that we know that have happened deterministically what other action edits are happening by other resources in foundry.

So if we accept those then we get a much more holistic picture of what's happening in this process. So despite the fact that we have a huge amount of automation here there is still a very clear manual transition that's happening here where edits of product campaigns and uh campaign email drafts are being changed. So now with a view like this we are aiming to give you a place where you can now decide what's the next thing I should invest in.

How can I get this step that's taking four days because I have it going through a human team to then take four minutes because it's automatable? And although this will never always be true, you may see edges that you believe should always be human, this should be a really good dashboard for you to understand exactly what the reality of your process is today and visualize what comes next. Now, once you've done this task, the thing that is important is this is a production system.

So I'm going to hand over to an to describe exactly how we're thinking about how you should then edit these automations in production. Cool. So we've kind of described how we can monitor, debug, and then look at how humans are interacting with the system, but now we kind of want to change it.

We might want to tweak things and we want to make sure that those changes are safe and we can deploy deploy them to production safely. Uh and the way we've done that in autopilot is integrated with foundry branching. Foundry branching is a global concept across the whole of Foundry.

Um, we kind of showed this off last DevCon, so I won't go into too many details on what Foundry branching is, but one of the things it allows us to do is change our entire workflow in one go and let us test it end to end to ensure that all of the automations, all of the functions and everything kind of perform as we expected to and we get all the same features in autopilot as we do on the main branch. So, for this demo, I've got a branch set up with all of my automations and my entire workbench on it. And I can see I've actually submitted a test campaign that has made it through the system.

I can see the same details that I would on main. And I can carry out further tests by submitting specific actions to this workbench. Once I've done that, I can then go through the usual branching workflows that you're all used to.

create a pull request, get approval from my colleagues, and then merge it to production and release it safely. Cool. Thank you, An.

Can we jump back over to the slides, please? Cool. Um, so key takeaways, autopilot is the IDE for your agentic state machines.

As you're elevating your processes, you're starting to bring in more and more automation into your system. Uh to Ash's point, there is something that you need to be able to do which is manage, observe, and optimize your organization around these things. Otherwise, you kind of lose track of all those resources you're introducing and you lose a sense of what those automations are doing and what the process is.

If you've already got to this scale, then I hope you looked at this product and you're like, I I kind of need that today. uh if you haven't, this product will end up being essential for your workflow. Now, the thing that's very exciting for us to be able to do the first launch of this product here at DevCon is the people in this room are the people we want to hear from in terms of how you'd use it, why you'd use it, and more explicitly why you wouldn't use it.

So, we're going to be here doing uh demo pods. We're going to be doing a deep dive, and we want to hear explicitly your feedback. Uh, and I get to use this cheesy line, but we want to know why don't you live your life on autopilot?