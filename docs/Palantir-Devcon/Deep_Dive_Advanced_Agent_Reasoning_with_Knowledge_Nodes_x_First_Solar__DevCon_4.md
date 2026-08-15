# Deep Dive: Advanced Agent Reasoning with Knowledge Nodes x First Solar | DevCon 4

Please welcome from first solar praep jutu and from [music] paluntier honorvon mukerji. >> Hello. Happy afternoon.

Welcome to the deep dive on agent reasoning with knowledge nodes uh with first solar um We want to talk about some of the things that uh that we're cooking. So this is not quite a product launch and more of you know what's brewing on our end. Um you know over the last couple years we've had many many use cases helping people um accelerate and even automate things that are work that we don't want our customers experts to have to be bogged down on.

But there's another class of problems that is actually about scaling that expertise. So think about, you know, um like assessing a potential merger and acquisition or, you know, digging into a root cause analysis on a complex machine. Um or deciding how heavily to redline a a legal document.

Um and these are these are interesting because you know often experts in in in our with our customers have complex and heterogeneous tasks, right? It's not the same thing over and over again in different forms. They exercise a lot of domain knowledge both from advanced backgrounds as well as from training on the job.

They have a lot of contextual knowledge um in their heads as well as understanding of how to use the data and they exercise judgment um as they do their work, right? And they do that in a way that's aligned with the objectives of their business. How do we get an agent to do that?

Right? That's actually a really high bar. And I'm going to talk about two of the directions that that we've been taking that are closely coupled um and some I'll call like pre-BA toolkits that we've been we've been um working on with some of our closest customers.

One is in the procode direction. So how can we um help developers build you know with an uncapped ceiling in terms of uh how they can build uh agents but beyond that also how can we uncap the ceiling of what agents can do and we've seen a lot of power in what can happen when agents actually think dynamically in code using the entire power of the ontology SDK and everything else that you can do in code. The second is uh what we're calling knowledge nodes.

And the idea of this is basically you know going beyond um memory or skills in the traditional sense to have a shared knowledge layer built at top the ontology. Um essentially for high bandwidth I'll call it agent upskilling and alignment. Right?

You don't want this to be owned by one single agent. Um, you want it to be able to rapidly and greedily take new context from both from experience as well as that you offer it. You want to have continual synthesis and refinement in the background.

You you don't want agents at runtime having to figure out which piece of information is more or less credible or um deconlict things, right? You kind of want to have that happen in the background. Um and especially in the context of procode um how do you connect theory of you know business concepts with the ontology SDK and code and capture that so that agents are are ready to you know not just understand the concepts but can actually uh implement um as they reason and um you know we've been doing this with with a couple of our of our deep partners and um one of them that has been pushing us a lot has been for solar so thank you so much And um it's been exciting journey.

We'll we'll show you some of what we've been doing over there. >> Um so maybe over to you to talk about >> Sure. Thanks.

I I actually don't want to take too much time, right? I think Kanan has a great demo. So I would give you guys enough context about the problem we are trying to solve and how we collaborated together.

Right? So a quick intro of First Solar, right? First solar started in 1999.

We are uh actually one of the largest manufacturers of solar panels in the world, right? Biggest one outside of China. Our um we have about 25 gawatt of capacity overall annual capacity and uh 14 gawatt of that is in the US, right?

We are kind of the only company which is uh decoupled from China's supply chain. uh uh that's a big thing when it comes to solar because uh I think if you look at silicon uh manufacturing right uh crystalline manufacturing 98% of that happens in China so this is kind of critical to our energy security when we talk about everything allincclusive energy policy so our biggest facility is actually in Ohio that's where I'm based out of right we have close to I would say 8 to 10 gawatt of capacity which we can manufacture out of that. So let me go forward.

So integration engineering right uh this is a critical function which uh which we have in the company. It's uh essentially they uh manage couple of critical functions around the quality of what we produce and the reliability of what we produce. So they are we have been kind of doing this uh since we started the company and we haven't changed this much right like uh if you guys know how solar panel works or not we literally harness the sun convert the photons into electrons right it's it's a high-tech process we manufacture wafers right semiconductor wafers and that's what is installed as solar panels and the technology we use that used to do that is called thin film and we are the only ones who can manufacture it at the scale at which we do and the precision at which we do.

So as we do it right I think uh it's very essential to keep our processes in tight control so we get good efficiency in our solar panels because what we sell is really watts to the customer. So the more watts we get out of a single panel the more money we can make. Uh that there's lot of variance in this process.

There's the reason why nobody else does it, right? And we have kind of mastered that. And as we maximize this, the other aspect of this is right from a reliability perspective, we write very long cycle uh warranties.

Our warranties are like anywhere between 20 years to 30 years. So whatever we produce, it's not just like uh we can label it saying hey it has high watts, but it has to be like sustained in the field for a long time. And we have a lot of testing processes for that.

So as you look at this right like uh the critical things for us is how do we detect any issues we have in our processes quickly and bring that into control right that's that's going to be critical thing how do we maximize our uh power output in those panels and continue to build that knowledge right so like this is something which you have been doing I don't know almost 20 years the same way right without much improvement So as we think about it like uh it's it's going through a lot of data right we have about a team of 100 engineers right across the company who do that on a daily basis it takes them about 3 hours per person to look at daily production data uh to synthesize hey what happened the previous day. So that means like we manufacture about 20,000 modules per factory and we have 10 of those right. So when you when it takes 3 hours and you're doing once a day it's lot of uh inefficiencies can creep in if you didn't catch them early enough right so so that's why it's critical and as we go about it we we have automated a little bit but I don't think we did enough right where the like the best we can get to is probably from 8 hours to six 3 hours right so there's a lot we can do so this is very very uh heavy in terms expertise right like as anan was saying for us to hire a uh integration engineer and get them to be at a proficient level it takes us about 18 months so it's not an easy thing like I can go somebody and hire someone from the street and they can do this job so what we are trying to do and push the envelope here is pretty high when it comes to what a agent can do and uh really like uh it's not one set of problems right if it just one set of problems.

We would have codified it a long time back. It's it's thousands or millions of uh permutations and combinations which you need to learn. Some you may not see for years, right?

So how do you learn that? How do you codify that within systems? And as we thought about it, right, it has to be very deterministic, right?

So one of the things which we are thinking is how do you kind of achieve that is if you can think in terms of code, right? If we can teach the agent to think in terms of code, maybe we can execute this safely and get reliable results in a repetitative fashion. So that's one of the things which we went after and it needs to be continuously learning and extrapolating right like you cannot just say hey here is a playbook it's like you can take these 10 different paths to come to this result.

So how do you continuously learn as you see new patterns right that's where a lot of things which Iron is going to talk about is going to come into effect and finally we want to be able to observe this right we want to have really good observability understand it because the minute you suggest a wrong action to take again what we are trying to avoid by not producing inefficient panels right we can just exe it so that's uh that's the background right uh with that maybe I'll hand it over to you on Heran. >> Well, thank you. So, just as I pull this up, um going to show you three things.

One is is just going through what it looks like for an AI agent to um reason through one of these processes using knowledge nodes. Um secondly, what does it look like to create these knowledge nodes to teach the machine? And then finally a look a look behind the scenes of you know how we've been thinking about these and implementing these uh on top of the ontology.

Um cool. So uh you know here we have a representative um you know view across a number of different plants. You know production of different modules as well as different KPIs.

You know watts is king right? Power is king. And um and as you may imagine there's some variation over time.

In fact, if there's not enough variation, that means there's probably not enough speed of R&D innovation in terms of pushing the envelope. But that also means you need to stay on top of that. And integration engineers are looking to understand, you know, what's happening here and how we how can we, uh, improve the process as much as possible.

And so um as we start to have agents working in the background digging into these on a on a continual basis, you imag you imagine agent takes a first crack at doing an investigation on a periodic basis of you know what's going on a certain plant on some time period. What's standing out? What's most important and why?

and starting with providing an initial stab at that to your engineer, right? And so here is uh here's an example of such a report, right? Where it's looked through, it's found a particular thing that's that's most worthy of attention, right?

You don't want 30 different issues that might be interesting, but like what's really standing out? In this case, a certain line um is experiencing lower thickness of a certain material in the film based on how it gets deposited in the process. Um and the the agent was able to to look through and see, you know, what what was the impact of that?

Was it due to a point in time issue or a calibration issue or what? um and and has walked through, you know, a number of statistical tests, comparisons to um to other lines, um interpretations, providing, you know, some of the time series analysis that that it's done, showing it to the engineer, um and ultimately recommending a couple actions of things to dig into, right? Um and this is cute, you know, I I'm sure any one of us could go and vibe code something that looks like a report, but how do you know it's actually reliable?

Why would an engineer actually read through this and use this as a starting point? And how do you get it good enough for that? So behind the scenes, as you might imagine, right, the the agent has gone through a number of steps here that we'll we'll see in a moment.

And uh it's it's done this autonomously, but of course an engineer can go and continue it conversationally from there. So um it has start been given an initial prompt in in an automated fashion to just look at a certain um plant in a certain area and it's gone through in this case 16 different reasoning steps to get to that report. Let's look at what those steps are doing.

So each of these steps right you know just kind of thinking aloud and then generating code which is capable of using the ontology SDK right it's pulling in this case the performance module data um as well as other operations and it's also drawing on these knowledge nodes these kind of this layer of knowledge um in the form of documentation that it can access as it goes along. So it's got some best practices on doing performance regressions that that has been curated over time as well as some other considerations. As we go through a number of these different steps, you'll see, you know, it's doing, you know, potentially some some more complex ontology queries.

Some of these further steps are we'll do like statistical analyses and modeling. Um, and it's also capturing these these plots as it goes along and saving them in uh in these artifacts. Think of artifacts as variables, right?

If any of you have used like Jupiter, right? You may make a gigantic data frame. You're never going to look at it, but it's there.

It's not you don't need to read it, but you can continue to work with it. So artifacts are essentially a way to it's a little bit different from the consumer apps but essentially a way to store this information locally and in the ontology that you can keep using as you reason which opens up a lot of flexibility in terms of uh what can be done but it also means that if this if this run were to run out of memory or something like that you can always pick up and keep going and I'll show later how this paper trail of artifacts and reasoning steps being captured in the ontology is open has opened up a lot in terms of debugability and um observability and figuring out how to actually improve these things. So let's look at where these knowledge nodes might have come from.

So I'm gonna pop over to um essentially a behind thescenes view of um so all of this is built on top of a we've essentially used the ontology to build an agent platform. Um and so we have we have our our different sessions here. Um all of our our agents are mirrored here as well along with um you know their prompts, which other agents they're allowed to connect to.

Um there's you know which uh which on which ontology objects are able to work with. I'm sorry I miscolked that. Um there we go.

Um, so this is essentially generating ontology SDKs per agent dynamically that they can work with within a certain scope. So you don't need to go to dev console and make a whole thing for every new application, but that's essentially the functionality that you're getting here and that's what's able to work with. So, um, let's look at a couple, uh, let's look at a, uh, a couple runs that will show what it looks like to actually produce knowledge nodes and, uh, because, uh, give me just a moment.

So, I like this one because it's a little bit of a different dynamic. So the previous one was looking at you know the agent really took a shot at generating you know the entire analysis but sometimes you know there's interactive inquiry right that's what the that's what engineers and experts do as they as in this case as they work with data right they're looking into charts they're running code they're running regressions they're running statistical tests and the agent doesn't need to be good enough to do that entire automatically out of the box. But if if an engineer can can pose an initial question and the agent can go through some steps, you know, um generating code, generating plots, performing regressions and analyses, then that accelerates the work of this engineer and it also means that the engineer is is steering this agent as they go along creating a trail of essentially evidence of how do you do an analysis?

as well. It's kind of like a like a collaboration. So, in this case, um this is this is uh based on uh some of the the work that we've been doing with some of your engineers.

Um this is there's lots and lots of different dimensions in the time series data. So, one of the things that they'll do is is use machine learning to identify important features and then use that to dig in through statistical analyses combined with uh different intuitions about what the variables mean. So um in this case the engineer and the agent are working through that collaboratively and you know at at the end of this you know yes they'll they'll get their report which is great and see uh as as you teach it you may need to nudge it a little bit as you go along.

So this is a pretty neat analysis, right? So it's it's it's it's done the feature importances. It's dug into all these different dimensions, electroluminescence, different parts of the production process, all that.

Looking at different outliers and the tails, how do they compare across the different lines? And what we can do then is is use reflection to say, okay, what did we learn from this, right? What did we learn about the manufacturing process?

What do we learn about insights uh for the future? What do we learn about the code mistakes that we that that we made along the way that the agent might have made and had to self-correct so that we don't need to make those mistakes again? Um lessons learned around that and it's gone and created a number of proposals of these um of these knowledge nodes.

So if you take a look at some examples of these, right? Everything from from here are some uh best practices about variables that could cause leakage during these kinds of um analytical pathways. Examples of um essentially like recipes of code that work and um and best practices on how to not hit some of those mistakes.

as well as just relationships between different patterns and um the the concepts in the manufacturing process. Right? These are the kinds of intuitions that engineers have in their head and they're not analyzing from scratch every time they show up to do things.

They kind of have that cache in their head. So we can we can go and save these into the knowledge layer and use them use them next time to get better and better. Just to look at uh a couple other pathways.

This is an an interactive version. Um, another common workflow is people say, "I have all this documentation and there's good information in there." I think in the interest of time maybe I'll spare actually uploading it and watching it were but um, what we can do there is is we can actually enable people to upload documents, you know, run books, PDFs, Jupyter notebooks that they made previously, etc., and have an agent go through and and connect the information that's in there with what it already knows and what it doesn't know to come up with edits to its own knowledge layer. So this is doing that deconliction and synthesis as part of the ingestion process.

I think this is a cool example here just um let me just uh show so so there's a flowchart that went in and you can see it's gone and and and and parsed out that that flowchart as part of that broader runbook and this is now in a format that has captured it that's that's very usable by by LLM subsequently as they start to get as they start to get better you can even start to put this on loop and say, "Hey, agent, why don't you go and troll around and look for patterns and come to and come to me with proposals of things and I can tell you whether they're right or not." So, this this way it's constantly looking at the data, constantly learning in the background. This doubles as essentially anomaly detection um and also helps with uh with data freshness, right? If you had an insight from last week that doesn't hold anymore, um these kinds of processes will help with that.

maybe just a bit under the hood and you know uh then we can do some some Q&A. So this system here that that's running you know it's it's completely procode in terms of how it's been implemented. Um so it's all it's all written in Python on top of the ontology SDK.

The agent framework itself is built on top of the ontology. um turns out to be really useful being able to use artifacts as message passing, having all of those agent logs for observability and evaluation. Um and that gives us a lot a lot of functionality where we can go and say everything from you know um how are knowledge nodes evolving over time, what are our unsuccessful errors, we can actually go back.

I think one of one of the things that um that agent developer users found really helpful is being able to go back to any any intermediate point in time maybe halfway through analysis and say um what was the what was the state of the world then in terms of the artifacts and what was the code that was executed. So you can actually fork off and say no, I want it to work that way instead or let's see if like why it made this mistake. And this makes it this couples with knowledge nodes really nicely because you can go back and have that that full analysis into into what went wrong and then go back and and teach it a fix.

So you know there's a lot of there's a lot of depth here. you know, we're we're exploring these dimensions both on the knowledge node side in terms of in terms of what are best practices for doing that continual synthesis in the background um to have the shared knowledge layer as well as more generally like like how can we push the bounds of how people can get the most out of the ontology as a substrate for building agents that have a high ceiling and that are highly observable, easy to steer. Um and uh um we're going to see what we can find and how we can uh productize that in uh in the coming months.

But working very closely with uh with our initial customers right now. Um do you want to switch to the architecture diagram real quick? I won't belabor this but I think that the key thing here just to double tap you know the the agent framework here we're calling it K4D is is bit built on top of the ontology the agents are running in our combination of compute modules and serverless Python that gives it the security to be able to run ontology SDK and any code that you want in a way that you can trust and govern um as well as lets us enable these agents to take advantage of some things you heard about like pass in terms of permission governance and things like that.

Um, and one of the key things we want to do is open up these these knowledge nodes to other consumers, right? There's no reason why this should be sandboxed to one um agent framework. And so we're working with uh AIP analysts closely to say how can we take learnings from some of these high-end workflows and make them available to everyone.

Um, of course, because the knowledge nodes are just in the ontology, you use them in logic, agent studio, wherever your own applications. One of the things I'm particularly excited about, um, is surfacing up those knowledge nodes to a FDE as you learn aentically different patterns of analysis that are recurring and that are powerful. Maybe you want to turn those into pipelines once you develop confidence in them, so they become deterministic and you don't need to have an agent reason through them.

So, um, a lot of possibility here when you own the knowledge layer and can use it across any of your your agent ecosystems and products. Um, cool. I think I think I'll stop yaking.

Would love to to hear what's on what's on everyone's mind. Um, we also have uh uh Peter here who's works very closely with uh Praep and and myself on all this work if you want to come join us. Um, yeah.