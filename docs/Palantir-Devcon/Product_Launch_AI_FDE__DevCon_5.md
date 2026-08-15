# Product Launch: AI FDE | DevCon 5

We're here to talk about building agents that solve meaningful problems for your organization. To do this, we're going to talk about a few new capabilities in AIFDE. Let's see what this looks like in practice.

Awesome. Cool. And rather than kind of just naming off these different capabilities, what I want to show you is how taken all together, I think these capabilities spell out a new paradigm for agentic engineering in AIP.

And so, what we're actually going to do is we're going to walk up to a totally manual, human-driven process, and with the help of AIFDE, we're going to build up to a kind of complex, compounding, you know, layered agentic system um that actually kind of solves problems for our notional customers um and gets better over time. And so, what you're seeing on the screen here is uh an incident inbox. So, for the sake of this demo, we can imagine that we all kind of work at like this manufacturing company, and we have these safety incidents coming in by the hundreds every week.

And so, those are things like equipment failures and near misses on the factory floor, the assembly line. And it's the job of one of our safety officers, so to speak, to kind of take each of these incidents, hundreds per week, and review them, and triage them, and figure out what is the type of incident, what is the severity of this incident, and what are our required next actions. And today, in this manual world, doing this work takes, you know, a lot of time and energy.

So, for for an example, like here we have this incident, it's about ventilation and some paint booth is cutting out. Um if I'm a safety officer and I'm trying to figure out, you know, how to triage this, I might have to review historical incidents that are in my ontology. I might have to go and read up on the kind of, you know, regulations that I'm bound by, find relevant definitions or any decision trees that I need to read up on.

Um I might need to go and look at like the spec of the part that I'm working with. Figure out what does maintenance look like going forward for this kind of thing. Um I might need need to kind of look at the facility floor plan and understand where did this happen and like, you know, do I have any internal processes I need to follow?

Um So, only then, after doing all that research and reasoning, can I really come up with a well-informed answer for what is the type of incident, what's our severity here, and what are our required actions. So, let's take a let's take a step back. So, our goal is let's automate this.

Let's empower our safety officers with an agent that will amplify their work, kind of abstract away some of this tedious research, and uh let the safety officers kind of focus on the most, you know, thorny, tricky safety incidents. So, how would I do this today? Well, we're building an AIP, so I'd probably reach for one of my favorite agent building tools like AIP Logic.

Um and so, you know, that looks something like this. I'd start setting it up, so like, input here will be an incident object, so I'll pull that in, um and select it, and then I'll, you know, set up an LLM here, and I'll write out a system prompt like, "You are a safety incident triage agent. Come up with incident type, severity, required actions.

Need to pull in my data from the ontology here, of course. So, I'll add that. Now, hold on.

This is not going to be the last time that you hear me say this, but can't AIFDE do this? I'm glad you asked. Um because actually, before I came up here, I ran an AIFDE session.

Um I dragged kind of that workshop that I was showing you earlier into AIFDE, and along with it came all of this context from the ontology. That's the nice thing about building in Foundry, because, you know, this workshop is linked to this, you know, incident data, those are linked to relevant regulation, right? It has the actions that the operators are calling.

Um and I gave it a simple prompt. I said, "Here's my data. I've got 50 safety incidents.

I've got this documentation from OSHA regulations. Um I want to automate this process. I'm looking for the type of incident, the severity, required actions.

Please build this for me." And with just that, AIFDE started decomposing this problem for me. It entered exploration mode and started doing the actual work that I would have had to do to make that prompt better. It's querying the ontology.

It's understanding what an incident looks like. It's seeing patterns in the data, right? What kind of categories exist?

Um it's going on, it's reading on on about the the kind of OSHA regulations we have here. And then, once it has that understanding, it enters logic logic creation mode, and it uses all of its new tools for building logic functions, um and creates this nice first draft logic function for me here. Um so, let's click into that and see what it looks like.

Great. So, it takes in an incident object, but you'll notice a few things are different immediately. So, it used semantic search to actually pull in the relevant documentation from OSHA regulations, which is pretty cool.

Um it also wrote a kind of used LLM block for us. If I scroll in here, you'll see the prompt it made up for me is quite a bit more detailed than that initial prompt that I just came up with. I think building something like this probably would have taken me hours of research and copy-pasting from OSHA regulations.

Um so, clearly, you know, AIFDE is a lot more patient than I am and faster at building logic functions. Um and so, the great thing about this is like, now I have this first draft that's probably better than what I would have come up with in the first place. Um but as many of you know, when you're building these AI systems, getting to this first draft state is not really the hard part.

The hard part is actually taking a prototype and bringing it all the way to production. So, at this point, maybe we should actually like test out how it looks like to run this function, um and maybe eyeball the outputs. But honestly, for something like this, something so critical that our users want to depend on, um we should really be writing evals and not just like eyeballing these outputs.

So, maybe I'll go in here and start, uh you know, writing an eval suite. So, I'll click into evals, and maybe my goal here is like, let's make sure it's outputting the right severity, classification, required actions. So, what I need to do is you probably should set up a few test cases here and select some incidents.

And honestly, I should really be digging into the ontology to to come up with good test cases, but maybe for the sake of the example, I'll just, you know, select some random ones here, and I want to check that it's getting the right thing. So, I need to set up an evaluator and an accuracy metric. Hold on.

This seems like a lot of work. Can AIFDE do this? I'm glad you asked.

Because, um actually, in that very same AIFDE session that I kicked off before this, um we can go over there, um it didn't just stop at like writing logic function. It knew that it we had this historical data from the ontology, and it then started to write an eval suite. So, it created an eval suite, and since it had researched all these incidents, it had a good sense of what are like good, diverse, representative test cases that have different patterns.

So, we can click into that here and see what did that eval suite that it came up with look like. And, um as you can see, it came up with just 10 kind of representative test cases. They span a variety of different classifications, severities, expected actions, right?

Um they it set up, you know, different accuracy metrics to check if we're getting things right or wrong. Um and it didn't stop at like creating the eval suite. It ran the eval suite, and good thing it did, because, um on that first run of the eval suite, um nine out of 10 test cases failed the metrics.

It was getting those required actions wrong like 90% of the time. So, even though we came up with that good initial first draft logic function, good thing we wrote evals, because if we put this in prod, it would have been horrible. Um but AIFDE is smart enough to know not only can it get eval, you know, data, it can go and continue doing that work of debugging for me.

So, it gets the test case failures. It starts reading the logic execution details. When it has clarification questions about, "Oh, should the test case really be defined this way, or do we actually need to update the logic?" It can ask clarification from me.

And I as a dev can start working and collaborating on the spec with the agent. Um and then, after doing a lot of that work, it comes up with this synthesis for me. The LLM is categorically over-prescribing actions.

And then, it translates, you know, that learning into an action. It's saying, "Okay, let me go and refine the prompt with much more precise, you know, restrictive rules." It goes and does that. It can edit logic functions.

Um and in a loop, it reruns the evals. It goes and debugs again. And only in one iteration we go we go from 90% failing to 90% passing on our tests.

Um so, we started with no logic function and just data in a totally manual process. I dragged all that into AIFDE, and we're left with a agent that is eval-validated. Um we're at this 90% accuracy point.

Great. So, 90% accuracy, maybe as a dev, I'm feeling pretty good about where we're at. So, like, it's good enough, at least in my view, to like start getting this up to users, start seeing what they think about things, start speeding up their workflows in the ways we know it can.

Um and so, I'm swapping over here to a kind of updated agent-first version of this incident inbox, where on the left you see those same incidents, but on the right here, we now have AI recommendations. And, um you know, rather than our safety officers having to do all of that tedious research work, we have an agent doing it for them. And they're left kind of just reviewing the proposals, accepting or rejecting.

If they really want to dig into how the agent did the work that they might have done, they can go click into the logic execution and understand, you know, what context did the agent fetch, all of that stuff. Um and so, we've basically turned their manual workflow into something that's actually agent-assisted. Um so, it's great.

And we feel good about this because also it was validated by those evals based on those historical kind of safety incidents that we had in the ontology. Great. But inevitably, right?

We're building agents, we're using AI and these powerful large language models, but we know that they're not perfect, right? And the world also changes underneath our feet, right? Our data will change.

The landscape of our business will change. Um and so, it's inevitable that at some point our agent will get things wrong, and we're not always going to be just clicking this accept button. So, what happens when we do see a failure in prod?

Well, ideally, we don't just let it hang out there and fail on that case every time. We actually have this as a a moment between the the AI and the human and their team to kind of learn from that mistake and in the future do better, right? We want to learn from these failures.

So, I have an example here where like, essentially, you know, we have a failure. So, the instance here is we have this incident. Essentially, we have this repeated failure that's happening at one of our assembly lines.

We have this door that's kind of falling on someone. Um it's happened three times in a row. On the fourth try, it kind of hit someone, uh hurt them pretty badly, and we actually tried repairing it, but it didn't work out.

Um and you'll notice this agent rated it as sev high. And maybe me, if I'm wearing my sort of safety officer, you know, hat, I might know that this is actually a sev critical incident. So we should have fixed this like right away.

Shouldn't have let this happen. So the great thing about this is I've actually built a feedback loop mechanism into this workshop. So when I do reject this kind of proposal and I'm like oh this should be critical, I'm left with this prompt to actually, you know, say what went wrong.

And so in this case I might say something like okay, should be sev critical when it happens three plus times. And I think the great thing about this is this isn't just some random string text that I'm kind of like shouting into the void, right? We're building in foundry.

We're using the ontology. This is going to be codified and encoded as an object. It's going to be linked and semantically represented, you know, linked to the incident, linked to the agent's execution.

And so as a developer, when a user submits feedback like this, I can kind of go into my ontology, I can read up on what was going wrong. I can start debugging my logic function and translating that into how I'm going to test it and fix it. So something like this is actually like great to have.

That sounds like a lot of work. Can AIFDE do that? I'm glad you asked because actually AIFDE can do that.

You're absolutely right. We can actually, you know, take all of this feedback in the ontology and point AIFDE at it and have it go and fix things for us. So I have an example here where I've kind of just took all of that context, right?

The the incident data, the same stuff in the workshop and pointed at the feedback and I asked it to basically do this work that I would have done as a dev to fix this for me. So it goes, it reads up on what is a logic function, what is the eval suite. It does all of this work of reading the feedback and synthesizing basically what it found.

Here's what went wrong. Here's why I think it went wrong. Here's what the user was seeing and and what we should do to fix it.

And so what it does is that is it follows this eval driven development approach that we've kind of baked into AIFDE which essentially lets it write a test case in our eval suite, run the evals, see how it's failing and then continue to iterate and iterate and iterate on the logic function until we're left with a passing result where we actually take that test case that was previously failing, rooted in that user feedback and we fix it. And so that's great because I've taken this user feedback and this system is actually going to compound. It's going to learn from our operators.

These end users can participate in the development of the system in a way because they're kind of offering the spec for us and defining these new rules. But this isn't really what it looks like when you're working on these kinds of problems. Like the feedback that I see when you're working on something like this is not something that's as detailed as or that as actionable as this is something like this is bad.

And so then I have to do a bunch of work of sitting with the user, figuring out why it's actually bad, drilling into what I need to do to get the make it actionable, turn it into something I can change the, you know, actual Yeah, but can't AIFDE do that? Because I had the same idea and actually I asked AIFDE basically what if we had an agent in this process? What if when we get bad feedback, we could have an agent intercept it and ask the user a clarifying question.

I kind of ran with this idea. I threw it into another AIFDE session right before this. Kind of gave it the same context and it kind of went through this eval driven development approach of building a feedback quality gate agent.

Ran evals, kind of iterated in a loop, right? Until we got this end logic function which I had wired up into this workshop. And so when users now submit bad feedback we have another agent prompt them to give better feedback, right?

What is the specific thing that makes this bad? And so, you know, in a sense we use an agent, right? That's AIFDE to build this agent, this clarifying question agent that will teach our human users to kind of give better feedback to this main agent.

Right? So we have agents building agents building agents. Great.

Can we switch back to the slides? All right. So what you saw here is a process of going through and layering on these agents to bring automation to one of these workflows.

You saw this using the logic tools and evals to iterate in that loop to get to something that is useful and then also can automate more and more of that process. We have a few other capabilities to talk through here. The next one is one of the most requested features for AIFDE and that's the ability to create and edit workshop applications.

So with this you can build on those ontology primitives and take all of the extensive widgets that are available in workshop and use them and have AIFDE create and use applications based on that. This lets you interact with agents because it's built on top of that same ontology basis. Applications are one way of interacting with your agents but you also want them to be able to act proactively.

AIFDE can now create automates for you which let the events that drive your agents trigger them as they're needed. So not only can it create the agent but it can also connect it up to the relevant events. As we take these building blocks, we really want to increase the kinds of tasks that AIFDE goes after.

So we've introduced the ability for AIFDE not just work on one specific task in the platform but really access the whole breadth of the platform with this automatic mode switching that we've deployed which increases the scale of the kinds of tasks that it can take on. As the kinds of tasks they on grows, we also have introduced new capabilities for smart context management that can help it maintain coherence throughout that autonomous session. As it takes these building blocks, it's able to work as an architect to design and document bigger processes.

Here it's using its solution design tools to come up with a draft plan for how it would implement a workflow and then it can use that plan as a task list to actually go and execute and build out each of the pieces of that workflow. We have many more capabilities coming that are rolled out in AIFDE that we're excited to have you try out today at DevCon. That's what we have to show.