# Product Launch: AI FDE | DevCon 3

Hello, I'm Ankith and I'm here to talk about AFD. Let's start with the why. The Palanteer platform allows you to execute with worldclass speed and efficiency.

We do this through ontology, the combination of data, sources of logic, and systems of action that lets our customers build workflows that solve their real world problems and start bringing automation into their enterprises. So, how can we take this further? We built a to faster than before.

This is building on the same primitives that the that the platform has things like ontology and lineage so it understands your endto-end workflow branching so it can operate in a sandbox without breaking your existing production use cases and the security model underlying all of this that is secure by default and keeps you in control. So what can it do? AFD can build your data transformations, create and edit your ontology, create functions, build applications, debug problems for you and many more uh coming soon.

So uh our design philosophy around this is to make it so that uh any clicks that humans do in the UI today should be things that you can have AFD do for you. So let's see it in action. Let's switch to a demo.

All right, for this example, I'm going to use some open data from the transport for London. So, this includes information like stuff about their different lines or station information, etc. Um, I've brought some of that into uh Foundry over here, and we can now start using AFD to uh build a workflow around this.

So, the first thing I'm going to do is I'm going to bring this information into AFD. Cool. I've dragged and dropped it in to tell AI FTE what I'm talking about.

And the first thing I want to ask is uh to help me understand this data. So I'm going to say um draw me a diagram explaining how these data sets relate to each other. Cool.

And the Palunteer platform has a ton of tools that I could use to go and do this work myself. Go poke through look at each of these data sets. But I think there's 12 of them over here and they would take me some time.

Um, instead I can have AFD do that work for me. Um, so it can uh produce that diagram based on the information uh that that we have here. Um, see if we have connectivity.

Let me give it one more shot otherwise we can switch to a backup. What does FTE stand for was a question. FD stands for forward deployed engineer.

Um, and that's that's a role we have at balancer helping our customers uh use our platforms to go and go and solve problems. So, um, I can ask a to do some of this work for me. So, in this case, it's able to put together a diagram explaining how these different data sets go uh go together.

um use the information we've provided to it uh to to unwind then give me some of the key relationships uh afterwards as well. So this can save me a bunch of time especially if I'm unfamiliar with the workflow. Some of this work might have already been done in the platform.

Um but it can help accelerate me. Um so that's the first way we can start working with AFD. Um in addition to that we have the ability for AFD to perform actions in the platform for you.

So um to do this I'm going to start with just a single action over here. So uh I'm going to give it the ability to query for different data sets and trans and start transforming them. So I'm going to ask it uh to figure out how to combine together some of this information.

So I see some information around um lifts or elevators in American uh and uh some information around uh geographical information. I want to see if I can say um can you query to figure out uh how to get a single latl long for each lift disruption. Uh I'm doing a live demo so parallelize your queries so it runs quickly.

Can't hurt to give it some context on what's happening. Um, all right. So, uh, as it's doing this, uh, let me talk a little bit about how, uh, how tools work in AFD.

So, uh, in our goal is to take the things that you can do in the UI and expose these as tools. Uh, so the model can perform these actions as well. Um, it can compose together different sets of tools to take actions across a series of different applications and uh, combine them together for a variety of different workflows.

Our platforms are pretty pretty wide, so you have a lot of things you can do in them. Um, and so, uh, I can talk through just a couple of the examples of things that we have here. For example, the ability to, um, edit files and, um, work with Git, go in and, uh, work with code repositories, including things like looking at CI checks, um, handling project imports, uh, working with data sets, including querying for them, building them, etc.

um being able to create and uh work on branches um edit uh and run and preview functions uh and then of course uh work with your ontology. So load, edit, and create objects, actions, links, etc. And we have a few more uh tools in in the work as well.

All right, so let's take a look at at what's happening over here. So as it's going, we see that it's uh running these tools uh to go and understand the uh the data that we have here. And so it's performing a series of different queries to be able to uh understand the the different data sets that we have and perform the tasks that we've given.

This is a closed loop system. So as we uh it runs these tools, we give it back the output of the uh of the executions so it's able to reason about it. And then we also present it to in the UI for users because we want this to be transparent so you understand what AFD is doing as it's working.

So, as I go through this, we can see that it's uh see we can see exactly which queries it's running. I can switch between these and see, okay, looks like here's a pretty complicated query that maybe I could come up uh with eventually, but uh definitely not something I'd want to want to spend a bunch of time doing. Um and you can also see it looks like it doesn't return any rows.

So, um it can identify, okay, looks like there's some mismatches here. Let's try some different approaches. Um and then it can come up with uh with alternatives and validate those uh those as well.

And over here, you can see, all right, cool. Now it's got a comprehensive data set with lift disruptions and their coordinates and it's given me a summary of of what this looks like. Um so this is great.

Um I can have it keep going tell us more about that or I can stop it uh and uh re steer in other directions. Um so this is how I might do uh more of an incremental step have it do a single task. Um but we can also ask it to do a series of different operations.

So I'm going to go ahead and copy a bit of a longer prompt here uh so you don't have to watch me type. And I'm going to go turn on the default set of tools that we have here and run this. So uh here I've asked for a series of different options.

So first all right using this context go in and create a workflow around resolving lift disruptions. So can it uh create a lift disruption object for me including you know primary key maybe I want to put it on a map. So give me a geopoint column.

Um here's the priority score uh that I want. and uh a tree. Before I jump into this, I'm also going to give it a little more context from the platform so we can do some work.

So, I'm going to bring in um some uh documentation on how how to actually do this. We have some bundles of that preset up. And I realized I haven't really given it a place to work.

So, I'm going to drag and drop this folder in as well, so I can uh have it have it do some of that that work in there. So, um this is a set of operations that I might do myself uh if I was going through and building this workflow. And I think everyone here has spent time in the platform.

So uh a lot of these will look familiar. So it's like all right I'm going to go in and I want to do this in code. So go ahead and create a code repository for me.

Go ahead and create a branch to work in so that those changes are sandbox. I don't want it affecting any existing production workflows here. So I want it to be uh operating inside of a branch.

Um then go start creating some of these transformations. Um and as we see uh here it's actually started to do those steps. Now, not every step can be performed autonomously by aft and we don't want it to be performed autonomously because we want you to have control over what's happening in your instance.

So, in this case, it's asking me for for permission because we don't want it creating code repositories arbitrarily. So, changes that might have an impact on your real workflows are not uh require uh a human in the loop to approve. And so, uh this is pretty uh intelligent per tool.

So, for example, it's totally fine to make edits if you're working on a sandbox branch, but you might not want to make those edits on your main branch uh especially if that's locked down. And um so using those same security primitives uh that we've we've built up uh across the platform, the model is able to operate in this space uh while still making sure that you're not going to break existing workflows. Um we can also go ahead and now have it create a branch uh which will give it a little more leeway to operate autonomously.

So instead of us having to approve each individual uh tool use within uh within this flow, we can ask it to go ahead and operate uh on a branch and take several operations in sequence. Cool. In the interest of time, I want to switch uh we'll let this keep running, but I'm going to show you what a more established session here looks like.

So I asked the same same sort of uh questions. So get looking through some of those uh queries, we see some failures and resolutions. Um and then I've asked it to go through it.

So here we have it go create a branch and then go through and create some transformations and uh we can see these transformations in the native UI for them. So um I don't necessarily want to be working inside of this interface uh while we're while we're doing that. So I can click this and it will take me over to the code workspace for uh for that code change.

So I can quickly see it in the IDE that I'm already comfortable with. I can go in and make any changes and work alongside AFD as I'm as I'm going. Um, and I can also use all of the tools that we've built in.

I can go and see all right, what are the other projects as references? What are um the ontology objects this is creating? Are there any external sources imported etc etc.

Um, so it can take me directly to that as well. Um, I can also see here that it's not always right. So we can see in some cases it makes errors and those errors are fed back into the model.

This increases its overall performance on the task because it can take those errors just like a human might and say, "All right, that's not quite what I intended. Let me now go back and edit the transforms." For example, um it had an ambiguous reference here. It went in, updated the code for that, and then tried to preview again, found another error, and then finally it worked.

But even in this case, while it technically passed, it doesn't look quite right. It's got a bunch of blank data. Um and so if you were looking at this, you might go in and make a couple more changes.

You might go in and say, "All right, I probably have the join wrong. Let me go and uh and take a look at that." And it's able to do that entirely on its own. Um, and I actually have notifications enabled here.

So, I can do this uh I can while this is running be doing something entirely different. And uh I'll get a browser notification when AFD needs my attention. Whether that's because it's completed its task or because it needs approval to go and do uh a step that uh it can't do on its own.

uh and so once it does that it's g it goes through and takes steps like waiting for CI uh building the data sets and then uh finally uh creating ontology objects. So at the end of the day we get this proposal uh that includes a set of changes the transforms it's made uh the object that it created. Um but like any good reviewer I want to make sure this actually works.

So let's try it. Do we think it can actually show up on a map? Um, so I'm going to go ahead and add a map widget and put it on the screen.

So I'm going to go ahead and pick those new lift disruptions that it's stitched together. And if it did everything correctly, we should see this zoom into a map. Cool.

Let me go ahead and also figure out which one of these I want to start actioning on first. So um, I think it has some priorities that it's set up for me. So I can go over and switch this to sort by a priority score that it's put together.

And I can want to do that the So now I know which is the most important ones to start working on first and uh I can if I want to see how it came up with that priority score I can jump into exactly what it generated review the details of that and I can instruct it ah I don't really think that's quite right try something else or modify it in these ways and so this is we can go from an idea into a working no code application very very quickly uh and then from here of course we can use these same building blocks in a procode uh environment so Uh I'm going to use in this example an application which will hopefully look familiar. Uh it is the agenda that everyone has received for uh for DevCon. Uh so I think it's pretty nice and uh I'm pretty sure a lot of that was built using some of this uh aft capabilities, but let's I think I think we can make some changes.

So I'm going to use the uh built-in continue extension in our VS Code. And I've actually run through this already. Um, I asked it to update this code to make all the sessions that contain the text AFD to be bright, bold, and animated cuz I just want to make sure that you know which ones uh to look for so you can find the demo pods later today and so on.

So, um, as it does this, it uses those same tools that we had before and uh, you heard about this a little bit with the the MCP talk earlier where it's able to access other parts of the platform and uh, run those autonomously to get the context needs. For example, what are the properties in your ontology? How do you represent the different sessions?

And conveniently here, it looks like our demo station is nice and glowing and pulsing. So hopefully you won't miss it later today. Um, happy to answer more questions there as well.

All right. Um, can we switch back to the slides, please? Cool.

Connect FD spans this spectrum of autonomy from tightly integrated into an application that's like that in VS code editor where it can use the tools uh that that are provided to it to make changes directly in front of you to the application. You can see to some uh in some cases a delegate for tasks things like the AFD application where you can ask for it to make changes spanning across a bunch of applications and maybe propose a vzero of a workflow that you want to build and then review it on a branch. uh and coming soon the ability to have this be proactive agents as well.

So if you have a issue on uh let's say a data health alert or something like that, can it propose a change for you so that when you come into the alert you not only see the alert but also uh a proposed fix for that uh for that problem? We've built a for production. Um Andre Karpathy uh the former uh head of AI at Tesla and one of the co-founders of OpenAI posted about this recently.

Um he's also the person who coined the term vibe coding. So he uh was at a hackathon and built this application. And while that hackathon part and vibe coding part was fun, making it real was a slog and had all of these pain points associated with it.

And as I'm looking at this list, this all looks very familiar. Uh things like dev and prod deployments, that's branching. things like being able to set up a secure authentication and uh permission environment that comes out of the box.

Things like how do I actually connect together the different systems that I have that's that's your ontology representation. All of these things are the primitives that we've spent years developing that now we can connect in to AFD to actually make this part of going from the idea that you have into production as quick as possible. And so we can do that without compromising on the things that you expect out of the platform like the control and stability that you expect.

DevCon 3 attendees will be able to try this today. Uh we will be rolling it out more broadly based on the feedback that we see here. That's all I had and I think we have some time for questions.