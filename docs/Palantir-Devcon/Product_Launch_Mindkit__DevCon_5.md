# Product Launch: Mindkit | DevCon 5

Good morning everybody. My name is Ben. I work on AI across our US government business.

And I like to take a few minutes this morning and share with you one of the newer capabilities we've been developing. We call it uh Hivemind. It lets you on the fly dynamically create agent swarms to solve complex uh problems in your enterprise or your organization.

So let's take a look at what we mean by that. We're going to walk through a few different pieces here. How do you create agents on the fly?

How's the ontology actually orchestrate those to solve your problem? But not just how do you take their outputs? How do you refine them, improve them iteratively over time on the fly, in, you know, real time, not just, "Hey, version one runs today, version two runs tomorrow." But doing that reactively in dynamic situations.

How does that How do those refinements ultimately improve the quality bar overall of the outputs that you're getting? And then finally, not just how do you come up with a plan to solve a problem, but does that compile in the real world? Can you actually go and execute that?

So, I'm going to switch over to a demo now and show you what we mean here. So, in this example, I'm going to uh play the role of a military operational planner that's responding to a real-time crisis where a natural disaster has occurred. We need to come up with a plan real time.

So, I've given just a brief problem statement for that, just like you would start working with any other kind of system. However, we could start with, you know, real-time situation monitoring or a ticket queue in your enterprise, anything like that. And as soon as we start here, um Hivemind has gone and done an initial kind of problem framing which you're seeing on the left-hand side.

So, beyond just, "Hey, there's a disaster that's happened, we need to respond to it, come up with an operational plan." What are the requirements for that? What are some constraints given the number of moving parts here? What are the risks?

How are we going to mitigate those? And if you see in the center of the screen here, there's going to be a lot of things that are happening kind of in the in the foreground, but also many different background asynchronous agents uh running on different conditions. And one of those is coming up with different ideas to solve these.

So, as you can see here on the right-hand side, one of the ideas that came up was um hey, there's you know, if we need to get people out, maybe a hybrid uh kind of option for railway evacuations and sea-based barges. Now, we make agents in Hivemind write plans and then go and execute those. Um so, you can see some of the things it's asking for.

It's going to go and do uh feasibility analysis, go do some research, uh go model some of the throughput for this, maybe simulate different options, and then come up with the plan. Now, at any given time in Hivemind, we've got lots of different agents doing a lot of different work. And here, you've got you can see one of these uh ideas is being executed, but down here on the bottom right, all of these have already create uh been completed as we were kind of prepping the scenario.

Now, as soon as Hivemind uh creates an idea or several different options for the planners, so in this case, I showed you there was one in the works for, you know, a rail-based operation, there's you know, an aviation operation, a maritime operation. What these are is basically like loose initial uh ways to solve this problem. So, how many ships do I need to get different people in and out?

And that idea is, you know, a good kind of starting point, but it's not our our finishing point. So, the way that we're actually going to go and improve uh that idea and actually make it something that we're ready to execute is by creating a team of agents in the context of this idea and this problem set to go and critique, refine, and improve that. So, in the middle of the screen here in red, you've seen the agents that Hivemind's created.

One about logistics, one about the risk or site selection for example. Each of these agents, as you can see here, they've had their prompts generated uh on the fly uh by the you know, by Hivemind's, not just ahead of time. That's you know, we don't always have a logistician, we don't always have a intelligence specialist or a medical specialist for example.

Um in every different idea and every different problem, the agents are uniquely tailored to that context. And their job is to go and write a critique of that uh specific idea. So, again, this agent's been given the guidance to go and assess different sites for this operation.

Um and it's been given a set of tools that it can optionally choose to use. It can write uh it can do more research. Research can look like looking across different objects in your ontology, going out and hitting the web, whatever the case may be.

Um it can also um though go write and execute code securely in the platform to help to inform some of the quantitative reasoning about this problem. So, for example, in this case, the agent decided to grab the coding tool, write a little script, run that on the kind of bottom right, and then we've generated a little explanation of that and, you know, a visualization for for the human planners to interact with. Now, each of these ideas in turn is um having that team of critique agents go and uh write in a you know, their critiques, hand that off to the rest of the team to go and iteratively refine and improve on that.

But, once an idea is ready to actually move on to a full-blown plan, um the way that Hivemind's going to do that uh is very similar to the last stage. Uh we say, "Hey, we've got an idea that's ready promote to a plan. Let's actually go and create the team of agents to task out to go and write different pieces of this plan.

So, for example, again, we've got um one around uh maritime shuttle operations, one around logistics. Each of these agents is then tasked with writing their piece of the plan. So, for example, if I take one of these uh this is a a facet or a piece of the plan.

It's gone and um additionally been, you know, written its output. And then again, iteratively through the kind of same process, we'll spin up a team of agents that'll go and uh poke holes at that, refine it, give it a recommendation for improving. Again, they can use more uh tools if they'd like to.

They can go and um hit different pieces of the ontology and um ultimately come up with that full-blown uh plan, which is what you're seeing in the center of the screen here. But, in Hivemind, we don't want our plans just to kind of sit on the shelf and be theoretical uh things. All of the uh everything that we've shown so far uh is actually this is the plan.

So, because the ontology has orchestrated this, every agent in the system has written their work back to the ontology. Everything you're seeing here is all the work that's happened uh and will be monitored kind of in real time. So, everything from your initial problem, all the research that was done, all the code that was written, all the ideas that were come up with, and finally our plan that's ready to execute.

And speaking of execution, uh the way we uh you know, think about uh this. So, for example, uh this is software that is deployed around the world for different types of military operations. And here, I've asked the agent to basically say, "Hey, go grab that Hivemind plan that we just made and turn it into something I'm ready to go and execute." So, now every uh asset, every phase of the operation, uh every different, you know, task that's been given is automatically kind of parsed out into this Gantt chart here with different objectives, phases, etc.

And we're ready to actually go and, you know, do this for real. See if this works in the real world. Now, let's zoom back out and this is Hivemind.

Everything that I just showed you is, you know, built on the same primitives that you're used to. Uh AIP logic functions running on different automated conditions. Deployed through marketplace, etc.

This is a very complicated graph, so to take a step back, let's uh you know, kind of peel back the onion on some of the pieces that go into this. If we could pop back to the slides. So, one of the first kind of principles we found here is um being able to uh generate agents for different parts of this problem set.

So, if we had tried to create all tens or, you know, even hundreds of agents that have uh contributed to solving that problem, it would take forever. We would never get it done. And we wouldn't get it right.

So, what you're seeing here is, for example, at the proposal stage, like I showed you, when we need to create the team that's going to go and write different pieces of this. This is a logic function that takes uh all of the context so far uh in this problem set, and it goes and says, "Hey, create this team of agents, give them the instructions they need, give them the tools that they need, uh give them the specific access to what they need to solve the problem, and then have them go uh come up with their plans and execute those." So, all the same tooling you're used to, nothing super crazy under the under the hood. It does get uh quite complicated, but think of this as logic that runs on different automate conditions as soon as objects are created and those plans are created and executed.

Next though is not just taking those outputs for granted and saying, "Okay, great. I made an agent. It gave me an output." But actually being skeptical, separating the concerns between them, giving them a specific, you know, narrow lens to focus on.

And that's what you're seeing here. So, hey, given, you know, I've got my initial V1 of my plan. I've got my team of agents.

They're going and running. I'm going to give you suggestions, refinements, improvements, et cetera. Or, you know, say, "Hey, this isn't ready to move forward.

Kick that back. Run V2, V3, V4, et cetera." That happens in multiple different stages. It doesn't also have to be applied within Hivemind.

You can take that and apply that to different parts of your your business. Um very kind of configurable and flexible on different problem sets. And overall, we refer to this process as an yieldment or um improving the quality of the outputs by uh you know, iteratively, you know, improving and pressing on those, not you know, just kind of like literally running through a workflow.

That's what you're seeing here. So, hey, version one of the proposal came in. We took it to the commander or to the the executive.

They had some feedback. They gave it to the agent. Now, that feedback is injected into every single uh part of the plan or part of the process, not just for that one run, but for every run in the future.

We kind of store those in the ontology and then, you know, as through that process, we'll be injecting those to that compounding knowledge base. And finally, as I mentioned, execution. So again, we don't want this to be a system that just you know, comes up with good ideas that we don't know if they work or not.

So, I showed you the example of Maverick for the real world previously, but this is AAFD. So, as soon as a uh Hivemind proposal is finished, uh we'll automatically then just generate a set of instructions for AAFDE as a system of labor to go and do work in the platform for you. And that's what you're seeing here.

Hivemind's finished with its plan, ready to hand off uh to FDE to go and code up, say, these um operational uh intelligence monitoring pipeline or the logistics supply chain uh monitoring pipeline for example. So with that I want you to think of HiveMind as a few different things. It's a capability that's being developed.

It's definitely not finished. Everywhere that we've deployed this in the real world whether for hard engineering problems or for planning problems or for investment decisions we've come up with a new idea not just from ourselves but from people that have used it. Added something onto the left, taken a piece out, applied that you know Lego brick in a different way.

Or you know customize something on the end. So we also think of it as basically an encapsulation of the tradecraft that's been working in the field for pretty hard problems. So as you get to build with this later today would love to you know kind of see what you come up with.

Think about this as set of capabilities, set of building blocks and then would love your kind of creative application of what to take it next. Thanks.