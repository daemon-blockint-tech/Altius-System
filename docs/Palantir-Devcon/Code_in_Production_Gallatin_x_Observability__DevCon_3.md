# Code in Production: Gallatin x Observability | DevCon 3

Awesome. Welcome everyone. I'm Bennett Norman, software engineer at Palanteer.

And I'm Daniel Bmiller, um, CTO and co-founder at Galatin. So, welcome to another code and prod session. Uh, this is going to be a slightly different flavor of a presentation than maybe you've seen in the past.

We're not only going to be showing off a production OSDK web application built fully on top of Palunteer with Foundry as the back end. Um, we're also going to be launching a brand new set of observability features in Foundry as we expand our capabilities as a production backend. So, you'll get the chance to see Daniel demo the product Gallatin has built on top of Foundry Navigator, as well as the brand new features in Gallatin's production environment.

Um, so as mentioned, to start off, we'll have a Gallatin overview, a navigator product demo, an AIP observability demo in Gallatin's production environment, showing off the brand new features. We'll do a formal AIP observability launch, formalizing the features shown, and then talk about what's next. So with that, I'll pass it off to Daniel.

Cool. Thank you. At Gallatin, we believe the AI revolution in military is incomplete.

You've seen a huge proliferation in cyber intelligence um C2 of course, but logistics was really left in the dust. Our adversary know this. They will challenge this.

And at Gallatin, we're trying to change this. We are less than one year old. We started on 1st of July.

We're HVC. We're the latest HVC build company. We're based in Elsagundo and Washington DC.

Uh just under 20 people now. Um we built what I'm going to show you today is Navigator which is our prime product and we built that on top of Foundry. For us there's lots of reasons why to use Foundry.

For us it came down to this. It's the speed to get to being able to use premier AI models in IL is 5 is 6 meaning secret top secret environments that are you know out there today in production and then the speed to an at which stands for approval to operate meaning how quickly can you get an approval to operate your code in those environments. That's what really matters for us because Foundry comes with about 80% of the controls that you need to do.

Um, and that's for us as a as a startup is is key, right? Like we're going from zero to one. Literally, we started less than a year ago to shipping now uh to to to our war fighters.

So, with that, we'll dive into the demo and hopefully have the right screen here. Great. So, what you're looking at is Navigator.

This what you're looking at is the front end of Navigator. So it's built on top of foundry on the back end. In the front end it's Vue.js uh with TypeScript um and we make calls into OSDK.

So very very common um the framework what Palanteer calls it. It's called a third party application meaning like you serve front end code uh through a server. Um what we're looking at here is the view of a army S4 logistics officer.

Um this is our real production environment. So we have obviously not just notional data and one of the core features or one of the core workflows today in logistics is um is called lost stats or um logistics reports. These are texts, Excel files, can be over radio like I'm low on ammunition.

I need more 5.56 very unstructured data. What we've built is a understanding a log set understanding framework basically to parse because today if you think about the logistics job, it's very manual. They get these reports.

They don't have an accurate supply level information. There's no consumption model. Um, and it takes them hours and the whole team to do that.

And today I'm going to show you how we can do this in in essentially minutes. So first what I'm going to do is I'm going to upload a log stat file that I've prepared here. So this is just a pure excel file.

Um what it's going to do is it parses it uses lm to extract it. Um it then compares it against the extracted date the log status is at a specific date in time for a specific military unit. It says, "Hey, for this time, for this unit, what is the likely um consumption that that will happen or that has happened since then?" And so we can see here, O stands for on hand.

So we recognized 6,000 gallons that they have on hand right now. Um we as navigator think a better suggestion there would be uh 10,000 and I'll get into the details how we come up with that. You can say I accept this.

Maybe make a small modification to this. Um the rest looks good here. Uh what's actually pretty cool as well is for the first time we can tie what's called NSN or national stock number from literally a company level all the way up to strategic planning levels because we affiliate that we find that there there's a huge catalog of official NSN and we if someone says just MREs which stands for meals ready to eat we can tie that up with the specific um national stock number so we can submit that.

What happens now is this informs the logistician uh of how that unit has consumed certain uh goods. So we can dive into the specific reporting unit. Have forgot to say we're at the third infantry brigade combat team level here.

We're going to go in to the 227 which we just gave an update on. And we can see here we can dive into the supplies. We can see the reported uh values that they have.

We have some graphs showing the historical. And what's pretty cool is we show predicted consumption. Why is predicted consumption why is it relevant?

It's super super difficult if you think about it, right? Like that depends on a lot of factors. But behind any military operation, you have what's called an oport.

And we do understanding stands for operational order. Um so if I go back here, so very similar to the lock stat parsing we built. Let me just refresh.

This is a live demo. So that's the proof for it. Cool.

So we'll go into a parse lock or border here and we can extract information like weather um you know in a different phase in a specific phase of flight phase of operation you might be offensive defense you might be building up a post and we extract all of that. So we then know if for example there's a high temperature like we have on the east coast right now, people consume more water and all this information directly flows into our consumption model which gives you real time uh assessment of what's going on. And then we go back the the the last piece that we're going to show you today is the um uh the what's called like the course of action, right?

So as a commander you now want to have the ability to say okay all these units uh what what we're looking at here on the map they need certain resupplies and our algorithm basically solves both an optimization problem and a traveling salesman problem to then come up with hey I have these trucks available um I have these resources to transport that's what we expect them to have before that's what we expect them to have after and these are the proposed convoys over the next basically 72 hours. And then one last thing here, um once you approve them, you can go in and you can actually see uh those convoys planned out. So let me make this a bit bigger here.

So this information takes into account uh friendly and enemy territory. It takes into account route planning based on what's actually reachable based on the resource that I have. So you know you might have a a waiting depth for a certain vehicle meaning you can cross a river at up to certain depth that's specified in an basically an open data model.

We can understand that and route um or propose a route accordingly. The decision here the important thing is the decision is always with the operator to take the final decision that that for us creates a feedback loop to then improve again our algorithms. So this is like just a sneak peek into um into navigator.

Uh what I forgot to mention there's mission time very hard to see at the bottom and that's on purpose. So a lot of times you you want to simulate scenarios so we can actually advance time. We're already in the year 2027 here.

Um you can advance time. You can see what what happens answer what questions. Um so with that we're going to go into the demo.

Um what you're looking at here is the workflow builder. So that's our current that's the entire scope of our app essentially in in one big view and what we want to understand what we've just seen is uh production right and we want to understand for the first time we have the ability to understand what actually happens in terms of logs so we have full traceability and that's what what we're talking about today so um and what I love about this view is just the complexity of your backend is just very visualized here and how you can dig in to a specific node and investigate further. Yeah.

Yeah. So we can see all actions uh virtual replication automation. So I can also search here and I can say get all entities that's the one here.

So it just highlights which one we have. Um so let's dive in. So these are the production logs here.

I can readily see wow this is quite slow. Um so let's dive in why that's the case here. And what we can see we can see it's kind of makes sense because these are hundreds of object loads in the background.

And so every time your function is run uh you get a request log emitted to this view. Then you can dive in and and so this is a function loading objects to the ontology. And this is auto instrumented for Daniel in Gallatin out of the box.

Um and so you see loading objects from object sets. You see the user code execution and then you see also the full function request um with custom parameters into each trace to give you added visibility. Yeah.

Um cool. And just if you're curious, this is the actual function that displays those glancable information points here. So these are like the green means supply level is good.

Same as you you can see. Oh, it's just auto reloading, but same over here. Um so you might think it's a super simple call.

It's actually not because every time we make that calculation, it calculates a real-time model of the predicted um consumption and and inventories. So let's go back to the runs. I've also noticed there are some that are super short.

So just like 400 milliseconds. So one thing we want to understand maybe do an analysis of what's actually going on. Um so I'm just going to open dev tools here.

Um we're all engineers, right? So we can because this is already super helpful, right? But there's much more that Palanteer delivers under the hood here.

So we can copy paste the I just what I did in the network tab. I just filtered by save. That's the name of the endpoint here.

I can copy um copy the response here. And then I just prepared a super simple prompt. There's nothing else, no context.

So let this run on OpenAI chat GBT. We can close this in the meantime. And then let's dive into some errors that I've spotted.

And let's just filter. So we can also filter by just all the runs that have an error. And let's just dive into the first one and see what's going on.

Go into details here. What we're seeing here also for the first time is support for log level. So I encourage you all not to use console.log.

Um internally we just changed our lint to enforce that. So should use console.info.warn.debug and error. So that way all the way through uh traces here you can actually see that properly call it but also for filtering and then again like we saw before you can dive in you can see the whole stack trace of actually uh like what what went wrong here.

Um, anything you want to add before we see what the AI generated? Cool. And so we've prepared this a few times and this is real, right?

So sometimes it creates a graph, sometimes it doesn't. Today it seems to be doing what we want. So that's pretty cool, right?

The prompt is like one sentence. You can see the standard like P99, P95 and so on analysis. And you can also see this kind of a um a a bifrocated distribution.

And that makes sense, right? because the the calls that fail they end up quickly they finish quickly and and what's been amazing about working with Daniel is he gives such great product signal so very soon you can see this feature uh in foundry okay yeah that's it awesome uh back to the presentation so this is very exciting uh given in December all this work was just mocks now I have Daniel here uh demoing all of it in front of you all production logging production tracing ing and production run history for functions, actions, automates, and models now baked into every ontology workflow out of the box. We are laser focused on getting these features into all of your hands, but also excited to talk about what's next on our road map.

So, first off, interoperability and customization, next metrics, um, and last monitors. And if anything I talked about interests you all, definitely recommend attending our Guardian session later in the day on the topics. So interoperability and customization, what does that mean?

So we're working hard to expose open telemetry APIs for function authors to emit spans, logs, and metrics with open telemetry libraries. We want you to be able to bring in code from anywhere in the world into Foundry and have telemetry emitted using open standards right away. Uh, additionally, we want you to be able to export your logs to not only a data set, but also a third party system.

We know power builders are going to want to do more with their logs, and we want to empower them to do so. Uh, next up, metrics. Daniel had the privilege to know where to look.

That's not always going to be the case. You need to have full observability and insight into your system, identify trends, and be able to dig into problem areas so we can let you know where to look. Um, a natural extension of that is health checks and monitoring.

For you to have trust in your system, you need to be alerted and monitored if things go south. That's key for a production system. Um, so observability may not be a sexy marketing product, but it's absolutely essential for any developer to build a true production system.

Uh, so Daniel, do you want to just end it off? Sure. Um, thank you so much everyone for your attention.

Um, some slides we saw QR code. We were not allowed to have one, so but we're hiring, so I wanted to make a shameless plug. Uh, instead of looking at the QR code, you can get some fancy stickers.

So just find me if you're interested in working for Gallatin. Find me somewhere around the conference. I also have two of my engineers here.

Uh David, if you can raise your hand, so find him. Well, it's very dark in here. And Joshua somewhere else as well.

So, thank you so much for your attention. Thank you guys.