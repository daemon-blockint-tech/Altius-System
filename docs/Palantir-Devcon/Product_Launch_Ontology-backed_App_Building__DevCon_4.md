# Product Launch: Ontology-backed App Building | DevCon 4

How's it going everyone? Good. Caffeinated, well rested.

Okay, we got a lot to show you, so strap in. This one's going to be really busy. Uh, I'm Elliot Hirsch.

I'm a product manager on developer platform team. >> Hi, I'm Ezra Ziggman. Uh, I'm a group engineering lead for our application ecosystem.

>> So, uh, what we're going to show you over this session is a whole series of new capabilities we've been rolling out to make it easier to build more powerful Procode applications. uh these capabilities are going to largely fit under two umbrellas. The first one is horizontal expansion which is how do we make it easier for you all to build applications uh that have more interaction points more types of users your the same proc code application you've written is used in three or four different places and then the second half of the presentation we're going to talk to you about vertical expansion and by that I mean how do you build more complex applications uh in each of these uh umbrellas we're going to show two capabilities but over the ch over DevCon you're going to get a chance to probably use many of these capabilities that fit under each of these umbrellas uh just uh By means of introduction, I just want to talk for a second about the Procode application stack because I think it's a useful introduction to the notion of horizontal expansion.

Um, when I think about the Procode application stack on Foundry, I think of the ontology, the core data model, maybe your functions and your logic. All of that is your is your enterprises backend. And then on top of that is the OSDK.

That's sort of the ligaments. That's the way you interact with that ontology. That's how you query, read or write from the ontology or manipulate it in different ways.

And then on top of that sits what I'm calling your application ecosystem. That's a set of front-end applications, uh, scripts, user interactions, whatever that might be, mostly UI. And our goal for this, uh, for this half of the presentation is to explain to you how we we're building features that will broaden the types of applications that sit at that ecosystem layer.

Does that make sense? Cool. All right.

Perfect. Uh, let's uh jump into the first demo. Okay.

So, this over here is the first feature we're going to show custom widgets. Uh, but we're going to start in a workshop. Our favorite place to start.

Um, this is a ambulance workflow. So in our example of that sort of stack, the bottom layer of the stack in my case is like ambulance management workflow. So we're everything you're going to see in the next couple demos are all going to be related to ambulance management staffing shifts, things like that.

In this notional example, in this case, my job is every week I go into this workshop and I staff the different paramedics to different paramedic teams. Uh so something like that. Uh and on top of that, I have all the filters in my sidebar.

So I can say, oh, I just want to see drivers. I have metrics at the top so I can see like who's staffed to which teams and are the teams are the ambulance teams fully filled. But as you might have been able to tell uh the cumbersome or bad part of the problem part of this workshop is this little section over here because uh ideally my workflow would do a lot more than just be a table where I assign people.

It would uh it would help me sort of visualize the slotting, tell me who goes where, what teams are filled, things like that. So the question is can we sort of uh build a hybrid workflow so I'm not forced to use a full uh OSDK uh application like a mobile app or a web app and I'm not forced to use entirely uh no code application like workshop. Can we sort of hybridize those together?

So I'm excited to to uh to talk about um workshop custom widgets which is something we've g a couple months back and we're rolling out features like every couple weeks now. And so let me show you what this looks like. So this over here is your standard uh OSDK application.

So this case use TypeScript uh powered by the OSDK and looks exactly like any other front-end application you might build at Palunteer. Uh but with one small difference which is now I have an additional configuration file that defines the inputs and outputs of my custom widget. In my case I want to take in a bunch of paramedics.

Why do I want to take them in from the workshop? Because that has that filter sidebar, right? So if I filter down I want to take I don't want to just use all the paramedics all the time.

I want to use the ones that have been filtered on that sidebar. and I output an event that tells the workshop to refresh the the metrics. Uh that way it knows every time I made a change.

So those are the two things I've defined in this uh file. Let me just kind of show you what that looks like uh up here in widget playground. So this is my my new slotting widget I made.

It's a little blank right now, but uh let's sort of play with a example paramedic object set. So that looks pretty good. Those are my like paramedics.

And then I might want to do things like staff them to team. So that looks great over here. Uh the idea here is that um this is that this simulates what we're going to pass in in the workshop in a second.

So, let's go back now to the ambulance management workshop and try to make this a little better. So, I'm going to delete this. We we do not like that.

Going to get rid of this header. And then I'm going to add a custom widget over here. Uh, and I'm going to point this at the ambulance staffing widget you saw before.

Cool. And now I need to fill in those parameters. So, I'm going to take the filtered paramedics as input, which is filtered from here.

And I'm going to take I'm going to say like when you get that refresh event, let's just refresh all the data in the module. Let's keep it simple. So this looks a lot better.

So now I can do things like say, okay, let me try to put a driver in the par in a in a paramedic slot. Okay, that's a no no. That's good.

Like if I do that, it'll say there's an error there. What if I try to put a cardiac response unit paramedic in a trauma team? Hopefully.

Oh, that is a trauma. Let's put that for an air ambulance. That'll be better.

Yep. So that'll say like no, that's the wrong specialty. And then if I fill up a team over here, so let's say I get a let me find a nice driver for the A team and a paramedic over here.

This should now tell me, oh, sorry, I dropped I put the paramedic. Let's do that one more time. This should now tell me the metric up here that I've one of my paramedic teams is filled.

So that takes the inputs and outputs from my custom widget, but allowed me to swap in a very bespoke workflow. Hint hint, this is a really good thing to use during DevCon because probably half your team is rushing to build a workshop really quickly, understands the workflow, and the other half the team wants to build that beautiful UI. So here you can kind of do both of the things together in like a hybrid workflow.

Um the other really powerful thing is the modularity and reusability of this, right? Because I've done this for slotting uh paramedics into teams, but I could do the same thing for let's say slotting I don't know like fire trucks into into different firehouses because I'm using this is all built off the ontology. I get all the ontology primitives like interfaces to make these things reusable and modular.

So you built like an amazing slotting widget. It's not locked in with just this one workflow. Okay, so that's uh demo one.

That shows you how we can sort of expand the the scope of your of your uh applications you've already built to more types of user interfaces. But the next thing I want to show you is kind of flipping this around. I want to talk a little bit about uh users.

So can we expand the Procode applications not to more UIs but to new types of users. Um and so this is a second workflow similar theme same ontology. But now what I want to show you is uh a workflow where I'm sort of doing these like schedules for the paramedics.

I want to make sure there's a film festival happening in New York this I don't think there really is a film festival unless someone knows something I don't. But in this case, there's a film festival happening in New York. These are the events that are going on.

And my goal is to make sure that the ambulance teams are in the right spots for those events. The one thing I'm missing is it would be really useful to know uh if anyone's actually going to these events and who's going. So in this case, what I really want is like this interplay between uh public external users and internal organizational users.

So this is where I'm going to introduce this new notion of public apps. Another feature we've been rolling out. There's a whole Canary session.

Definitely check it out later. Uh so the idea here is we as a team are going to sort of simulate this. But before we can simulate what this looks like, I need to uh switch over and show you how we define that public application.

So the idea is we're going to build a a new application, not the one you're seeing on my screen for our public users where they can submit information that I can then utilize over here. Does that make sense? Cool.

All right. So this is my uh this is the onto this is the app uh uh offclient devconole that that backs the public app. You haven't seen that yet.

We're about to show it to you. But I just want to show you a little about the setup over here. So uh this is me adding a new ambulance object to my app.

And the idea here is this is now incl would be included in the scope of my application. And of course when I uh try to save that it's going to warn me and say hey this is going to be exposed to everybody. Right?

This is a different thing than your standard internal ontology that you want internally. This is an app that's exposed to all your users. There's no there's no login necessary.

And of course it'll tell me that if the data is marked as this case it has this Devcon form marking on it that I would have to have permission to declassify that. Let me just show you what that looks like when you mess this up. So here I'm going to go take the sensitive paramedic employee record.

Now it's not going to let me even save this because I don't have I may have permission to see the sensitive paramedic employee record but because it's marked I don't have permission to declassify that meaning to remove that marking and expose it to the to the internet. So that's how you kind of use the same security infrastructure that you get everywhere else in Foundry in the public apps setup. And of course other than that it's exactly the same as every other OSDK app you love.

So, it's super easy to to add resources and to build on top of it with the OSDK. So, now for the grand reveal, let's maybe all can we all be part of a giant human diarama with me for a second? I'm going to um pull up this uh QR code.

And the idea is well, as you check into these apps, they'll hopefully turn from the the events will hopefully turn from red to yellow or green or whatever. Uh the app was fully built by Claude, which is why it's purple. So, I'm sorry for that.

Every Claude always builds in purple. I don't know why that is the case, but um but that was just like a very quick application built on top of that layer I showed you before. So yeah, people feel free to scan and then let's start doing Oh, they're ready, yellow.

Oh, one's turning green. Can we get anything to purple? Yeah.

Okay. This is all, by the way, streaming in. I'll show you in a second like how we set up the streaming piece over here.

The idea is none of you have to log in, in case you didn't realize. None of you have to log in to use that application. This is just available to the public.

Of course, this is just one subset of my ontology. I wouldn't want you guys all looking at the ambulances uh over here. I'd only want you looking at the event at the events and signing into them.

So, does that make sense? How we're taking these two these two concepts, my internal ontology, my external ontology and the public apps allows you to sort of add a new dimension to the the front end application. Another way of expanding horizontally the way you use your Pro Code applications.

Okay, so that's uh part one of the presentation. Now, we're going to sort of flip it around and talk about application complexity. Uh and the idea here is can we build uh applications that are more similar to types of things that we make internally a palunteer.

A good example of this is is Gaia. Gaia is our uh mil our military operations map uh application. And uh Gaia is the type of application that isn't really sort of like a plug-andplay with lots of individual maybe like a little widget here.

You every piece of it is bespoke. Every piece of it fits the very specific types of workflows that our customers want. Uh and on top of that it's very user complex.

tons of users interacting with it simultaneously. Uh tons of users uh all interacting with um the same uh like same state or shared state. And so the question is how can we build applications that uh can allow you to build the same types of applications on Foundry that like Gaia uh that are super complex like that.

So I'm going to show you one uh quick demo over here. Uh uh hold on. So this let me just get to the right file over here.

use paramedic shifts. Okay, perfect. So, this over here is bad application here.

I take my a team over here and I want to basically send them to Washington Heights, but instead uh it says shift location updated, but the little Gant chart thing at the bottom still says Morningside Heights. And if you notice, it kind of flew back to where it was before. That's me writing bad application code.

Uh instead uh what you probably would see is not this sort of naive code over here, but what you probably see in the wild is some sort of caching framework that's used to sort of keep all your widgets up to date and in sync with one or your components up to date and in sync with one another. Something like React query code like down here. Uh and that's really good, but it's still pretty complex to manage.

The question is given that you've already defined your entire ontology and all your actions, uh can we just give you all that for free? And so now I'm going to replace this with what I think is a slightly better workflow. Uh and it will I'm going to write it live on stage because there's very little here.

So this is our new hook we're introducing for use OSDK objects. And I can pass in paramedic shifts. And now with a little refresh, we're going to have the same workflow.

I'm going to take this a team from Hamilton Heights. By the way, did you notice on the refresh it worked fine, right? The problem is the components weren't in sync with one another.

So now I'm going to take the same AT team and I'm going to kind of send them all the way down over here. And there's an LLM in the background that's like scanning the coordinates and fig Oh, boom. It just reset it to Yorkville.

I don't know if you saw over here, reset it to Yorkville. I can move that around again. And now this is updating live.

So the power over here is that with one line of code, I'm leveraging everything I've already done in my ontology. The old way looks kind of like with like something like React Query, you end up with a ton of these sort of invalid query statements. you call an action, you say this component has to rerender, this component has to rerender.

But at scale, as your application starts to get more and more complex with lots of different components, this becomes really difficult to do. And so the idea is uh with a single line of code with a use odk actions hook or the use OSDK objects hook, we take care of all of that for you. And on top of that, you get a bunch of other things for free.

So for example, the thing I mentioned before about streaming, I now have a parameter I can pop into here like stream updates is true. And now uh not only does this application update when I'm when one component tells the other component to rerender, but also if someone else is using this application elsewhere like you all were when you were submitting the public app information. Uh that all gets live rendered over here.

That used to be 10 lines of code because we're doing this all with the with the OSDK hooks, you get all of that for free. Okay. So all three of the capabilities I've just mentioned uh I've talked about uh widgets, public apps and the OSDK hooks are all available today and uh we'll work with you over Devcon get a chance to use all these a bunch of different canary sessions as well where you get to try them.

I'm going to turn it over to Ezra to talk one more example of how we get deeper in application uh cap complexity but this time with some of the stuff that's more cutting edge. Thanks Elliot. Pull this up.

Cool. So the second way that we're enabling developers to go even deeper with their custom OSDK apps is PAC, the platform application capability kit. PAC is the latest evolution of the real-time frameworks that we've developed at Palanteer for building complex collaborative applications.

These are frameworks that we've literally battle tested building multiplayer applications like Gaia for the military. I'm going to walk you through how we can use the three initial pack capabilities, which are documents, activity, and presence to take this incident planning app to the next level. So, let's say that I'm a safety coordinator for the city of New York, and I have a team that's responsible for planning paramedic shifts like Elliot was showing.

I if I'm using this incident planning app, I don't just want this static cut of data from myontology. For different events, I'm going to want to see different activities on the map. Maybe I want to see different paramedic teams with different specialties.

And maybe I even want to change some settings on the map like what property is featured on this Gant chart here. And I want to be able to share that all those choices that I make with my collaborators so that they see the same view. And this is where pack comes in.

The pack document allows you to create a new file type for your application that bundles together application specific state and ontology data in a way that's optimized for collaborative workflows. So let's see what this looks like. I'll go over to the code for this application.

Close this. Cool. So, this is our document schema.

Uh we define this in TypeScript. And you'll notice that uh in our types, we have a mixture of ontology references. So, these are the paramedic teams and events that I want to be able to pull onto the map.

And then also application specific state like settings. So, you can see in here uh we'll have a setting for what property is featured on that can chart at the bottom. Now I could implement this all in the ontology, but something like the setting of what property is promoted on a Gant chart of one event map is not useful across my organization.

So I don't want to litter my ontology with that kind of data. So we're going to bundle that together into this document state. So once you define the schema, you're able to generate a TypeScript SDK to use in your app.

And let's see what the app looks like now that we've added this document functionality. So I'll go back to the application. So, in this app, I can now hit file, new, and I'm going to make a new event app.

We've been talking about a film festival. Let's say that this weekend we're going to do a rehearsal for the Thanksgiving Day parade, and I want to plan some paramedic shift for that. So, I'll make a Thanksgiving rehearsal.

And I can choose who to share this document with. Uh, this is backed by all the same robust access controls you expect from the Palunteer platform. So, I'll share that with my team.

Choose a roll. And now we have our new map that's ready to add data to. So let me pull up object explorer and we can start pulling in some ontology data.

So here I have my paramedic teams. Um, you know, this is just a rehearsal. Maybe we don't need anything too specialized.

So I could filter this down based on specialty. Let's just say general. Add this to the map.

And then we are doing the Thanksgiving rehearsal. So I'll add that event to the map over here too. Great.

So now we have all of our data. Because Pack understands your ontology through these ontology references, it's easy to drag in this data from your ontology and render it on the map. Cool.

So going back here, we talked about settings. I've built this um settings cog into the app and I can change the promoted property on the chart. So you saw before Elliot showing that this was the location featured.

Let's say I want to change it to the end time. I can save this. And now I have this map that's customized for what I want to do for this event.

So what PAC is doing for us here is two things. One, we have this document which is a secured sharable view of our application. I could take this link and send it to someone else on my team and they would get exactly the same live view.

The second thing that pack is doing is that it's bootstrapping application specific storage for us. you know this setting of the Gant chart or other settings that you want to use. These are really specific to this application and to this event and I don't want that polluting my ontology and this document model is what we found works for us building our own complex applications on top of the ontology.

So the idea with pack is that we're not just giving you the ontology we're also giving you the solutions that we've developed for building applications so you can focus on building what's unique to your application. So, now that we have our document, we can go even deeper and add more collaborative features. Um, with this kind of shared file, I imagine you've had the experience of opening up a file that you shared with others and it looks totally different than how it did yesterday.

Someone's made a ton of changes. This can be really frustrating if you can't see what's happened. Um, so what we found is that as you have lots of users collaborating on a workstream, it's really valuable to see a unified view of changes that are happening in your app.

And so pack activity is going to make it really easy for us to add a feature to this app that will show us a a history of all the changes. So let's go back to the code here in my schema. Alongside my state for my document that I'm saving, I can also define custom activity events that are relevant to my app.

So here I have a uh settings change activity event that we're going to want to make a note of whenever we change settings so that we can see a log of the history of those settings. So from here now that I've defined this event and you'll notice that I'm able to define to reference types in my document state uh in my activity since we defined them all together. So here we have the old settings and the new settings.

I'll now go to that settings dialogue that we saw and right now this is where we are uh updating the settings when we make that change. And I will comment this out and just add a little bit more code down here that will also record this activity event uh when we make the change. So here you can see that we're sending the old settings and the new settings.

And this should result in a nice historical event that we can see. So let's go back over to the app. I'll make this change again.

Changing the prone property. Let's go end time to start time. And I hit save.

So now if I pop open this activity panel that I built on top of pack activity, you can see this activity event of when I changed uh end time to start time. So in this activity panel, what I've added is a mixture of events that are specific to my application state. But you'll also see um that we're pulling from the rich edit history that already exists in your ontology.

Uh here you can see actions that we've done to the parametic shifts. And because pack knows your about your ontology and what objects are on the map through ontology references, it was super easy to build this view that gives a unified view. Again, we could have sort of forced this into the ontology.

I could have made some objects and recorded uh an activity event every time I change these settings. But this is data that I just want in my application and is not useful in other context. So pack activity gives us a way to bootstrap defining uh storing and streaming these activity events.

Lastly, to make this application truly feel multiplayer, I want to be able to see what users are doing live as they're working. If someone's making changes, maybe drawing on the map, moving things around, I'd really like to be able to see that live so I know what's going on. We have the ontology and we have documents for persisted state.

But for high-scale streaming events in an application, it may not make any sense to persist that. You know, say that I wanted to show the live cursor location in my app. As soon as someone closes the tab, that data is irrelevant.

And so the third capability of pack, which is pack presence, uh gives us an easy streaming API to deliver those kinds of high-scale events to all clients. So I'm going to show how easily we can add a feature like live cursors to this application. So going back to the code one last time, let's go to our schema.

So alongside our document state and our activity, we also can define custom presence events. So here I have a presence event that's going to have the location of my cursor on the map. With that event, I can go into my map code and just add a little bit of code to make these cursors show up.

So here we have uh when we move the mouse, we're going to stream an event to pack presence. Add that in. And then the last thing that we need to do is uh receive those events and update the map.

So it's a little bit of code, but only about 20 30 lines. So let's hop back over. So here you can see now that we have users live on the map with their cursors.

And we also have uh out of the box live presence information about who's online so you can see who that you're collaborating with. So in just about 20 or 30 lines of codes with pack presence we're able to have users drawing live on the map like John Madden annotating a play live during a broadcast. So this is pack um pack is coming soon.

Uh we're expecting it to be available for first adopters in January. Uh, but I encourage you to come to our Canary sessions to see how you can add these rich multiplayer capabilities to your own applications. And let's go back to the slides.