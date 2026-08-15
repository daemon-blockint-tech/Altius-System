# Product Launch: Rapid Software Development with OSDK 2.0

as you've been seeing throughout the day and hopefully been experiencing as you're as you're doing this hacking uh and working on your own your own projects. Uh the ontology SDK gives you an API for your organization. It makes your organizational your organization programmable.

It gives you a language that you can translate into code. This next launch is giving that language some new words and uh some new grammar. uh it's making it easier to express what you want uh what you want to say and will be useful for doing things like building reusable components or uh building real-time applications and more.

This is a case where we can push the frontier of what you can actually build. So excited to have uh Iran and Eric show you more. Hello.

Hello. Thanks for having us. Uh so my name is Iran Whitken.

I've been with Palunteer for about eight years. five years I've worked with companies like yourselves uh helping you uh adopt Foundry. In the last three years I've been a product manager and uh leading the uh product development of uh OSDK and uh I'm EA is what the people call me around here and I'm a software architect on OSTK TypeScript.

I've been a palier for 17 years and on the OSTK for a year. So you've probably heard a lot of OSDK verbs here in the last uh you know few hours and tomorrow we're going to hear a little bit more. I hope I'm you know turning around in your build sessions and I'm seeing people using it.

What is it? Uh so it's the it's kind of a the word that we use to describe the set of tools that are given for a developer when they want to build their application powered by a foundry. So imagine it doesn't matter like if you're writing your react application or you you're writing your Python application outside of Foundry but you still want to use the Foundry as your back end, Foundry as your infrastructure.

OCDK is the connecting tissue to do that and we are doing this uh through an SDK that is written in Typescript in uh Python and in Java and we also publish an open API spec. So if you want to take that spec and load it into one of the open source generator, you can do this in C or in Go or whatever favorite language that you want to that we want to do. And we started that journey about uh I don't know two or two and a half years ago or something like that.

And since that we uh we've discovered that uh we can do the language even better. And what we're now launching is what we call TypeScript 2.0 uh which is a new version of the TypeScript SDK. uh and that's what uh uh EA and I are going to show you.

Actually, it's on me to press these buttons. So, what can we do with uh with OCDK? So, the first thing is we want to build tools that is fun to work with.

Uh in this example, I'm showing you like a TypeScript application. Uh you can build a React Native uh um applications running on iPhone, on Android or what have you. uh you can build AngularJS.

I'm not saying it's fun, but sometimes you have to do that. Uh and as I said, you can do open API uh and do whatever you want with that spec. Um we want to make sure that the whatever we are providing you helps you write a type- safe application.

And if you don't know what that means, it means that you will catch it's not that you're not going to have bugs, but you're going to catch the bugs in your development uh stage and not in your production stage because it's all going to be typely saved. We're going to tell you exactly what properties you can use from the ontology, how you can use them and all of that. Um, we're going to simplify the whole process of the OAS flow into one line of code and you're going to see that line of code and the whole redirect and everything is going to be managed for you.

Um, we want to keep it simple. I let you do the last S as you please. But this is all the code that you need in order to instantiate a client, create an off uh an authentication object and use this object to query something from your ontology.

So pretty simple. Uh not saying that this is the best app or the most productive app, but it just shows you how simple that app uh uh could be. Um, uh, we're also making sure that we're not too opinionated, uh, in the sense that what the SDK lets you do is do the connection between your application and Foundry, but what you do in your application is pretty much up to you.

So in this example, we're showing you how you can use uh SWR as your uh kind of state and query uh uh library, but you can use React Query or whatever other language uh or or library that you want. And you can also use the uh you can also build your own libraries in it. And EA is going to present some of this in in uh in a minute.

Last thing, one of the things that I really like about uh OSDK is the ability to take all the AIP functionality that you have in Foundry and embed them in existing application. So it's not just hey I'm going to want to start a new project starting from scratch and now I'm going to build the whole UI. But imagine any of your ERP applications, any of your SAP application, whatever whatever you have, you can now take an AIP logic, register it as a function, use the SDK to use that function and just call it from wherever you are in your uh organization calling into Foundry.

In this example, and if you've seen this in the booth uh in the uh in the dining hall, uh this is imagine this as an existing application and I'm using the SDK to query an AAP agent and ask questions about chess or about myontology. So just as an example here. So let's go to a quick demo.

Uh if we can switch to the demo machine on one. So this is my VS code. Uh in this one I'm uh using an ontology that is querying uh an a Wi-Fi location uh uh data set that I took from uh open-source uh uh places.

Uh I'm using like I'm just presenting this uh as a way uh to show how we're using the SDK. All that you need to do is basically, you know, query that specific object that you want with your client, define the wear clause uh that you want. I'm I'm filtering here based on Manhattan borrow.

I'm selecting whatever uh properties that I want. So I can trim down the ontology just to the properties that I want from that specific object and returning the first page of 50. And just to prove you that this runs on native uh app, I'm just going to run an iOS simulator and launch that app in a second.

It will show you the expo uh framework. And that's failed. That's great.

So, we can't have something without a bug. Okay. So here we have uh the Wi-Fi locations listed here.

If I want to show them on a map, I can also show them on a map. So very simple. I can also use any of the functionality of what we saw previously on the platform SDK.

So I'm not going to do the whole kind of a create data set, run a build and all that. But I can show I can run the admin APIs. So in this case I'm just calling the admin API to see who is the logged in user and I see that it is myself uh and basically uh see the uh the data from from foundry either as API as a platform APIs or as SDK.

So with this I'm going to hand over to EA uh number two please. Awesome. Um this is cool.

I can't believe I have to go to the other one because that was really cool that we just saw seconds ago. I feel bad that we're not that cool. We're going to open up the buses in New York if the data is still there.

Well, that's cool. Or not. Oh, there they go.

Okay. Um, so I'm loading the data from the MTA in New York. Um, it's not very exciting to do, but hey, there's a cool map and it's 3D.

Um, but where I'm loading this from is a generic piece of code. So, I've created this data source uh for uh what's it called? CM is the library that does the map.

And this data source knows nothing about myon ontology. Like this is the generic library that's not like the one that we made. Um, none of these things are my ontology.

And so I can use the generic types that came from the OSDK to build something that knows nothing of the entology and yet can load your objects up and pass them back to you in a type- safe way that you know is correct. And so in this particular case, we're loading up objects like you would do for any other ontology thing, but instead of getting back the concrete type, we're getting the generic. And so this is really cool then because if I go back to my app here and I want to change this around, I could just change the object I'm passing in and the mapping of the fields and I didn't have to do any of that extra work.

Whereas I think otherwise you oh I have to make a new data source. I have to load all the objects again. And so you can start to build things for yourself or for others that make these things reusable.

Um so this means I could take this and uh take that library version that you had and publish that on GitHub. I don't have to necessarily have it be something that's lives only on my uh instance because it's not specific to mine. It's just a mapping library that works on any objects.

And in fact, I did that. So we on my personal GitHub, I have a bunch of different things that you can use that are all based on the same concept that I built for doing the demo. You know, you want to get a bunch of OSDK pages that are cached in SWR that does server side um sorting or anything you want wear clauses like that's it.

instead of doing, you know, that much code before, now you can do that much code and you don't have to write that ever again if you just always want to load those pages up. And so as you start to get your patterns in in what you do at your where you work, you can actually build up your own library of things that save you a ton of time. Um, cool.

So next I'm going to show you subscribe, which I don't think is is all that cool besides the fact that it works, but there's really nothing to it. So, I'm going to go ahead and turn off the full load of these this data. And I'm going to say this now before I show you the code because the MTA data is so slow at updating that you might be upset.

Okay, so let's go look at subscribe. Um, this is actually all you would expect it to be. There's literally nothing you have to do.

You you say subscribe, you get on change calls, you get the objects, the SDK objects. That's it. Um hopefully so just to cut you off here.

So before I had this you know five lines of code that you're saying what I actually had to do is I had to uh kind of put a timer that every five seconds or what have you do a refresh on the server get all the data set back and then manage the client the the the changes between you know the thousand objects that I had on the client and the two that were just updated. So now instead of doing all of that complexity, I don't need to do this. I can just subscribe and get the two objects that were updated and then decide what I want to do with them in the application.

Exactly. And this is over websocket. So we're not we're not pulling.

There's no additional work here. We're just sitting here waiting for the server to tell us and the objects change color to sort of show you how old they are. But it's it's really simple this way.

That's cool. Um and as you saw, I didn't even load anything to begin with. We're just getting the objects as they as they change.

Um, so that's subscriptions. Um, it's pretty cool. It's coming in the next version.

I think in 21. I hope it comes in 21. Um, now I want to show you other ways that you can reuse your code.

Um, and for that I'm going to talk about interfaces. And interfaces are a foundry concept that are not that different from interfaces in other programming languages. You can define sort of a virtual object and put properties on it.

Um, and then you can make various ontology objects implement it. And what this lets you do then is write your code for just that that interface. And as people apply that interface to new objects in the ontology, they'll just kind of start showing up and be available to you.

Um or you can use it for other things. So I made one earlier. It's called vehicle.

It's got the exact same properties. Um there's only two here versus the the MTA object had um like five, but I only need two. Oops.

Um, so we have this vehicle and when I save this and do the full subscribe, it's going to be um pretty uneventful because well I didn't I didn't change anything, right? It's just using the interface now. Um, so I kind of want to talk about what interfaces are a little bit, how you can use them to your advantage and how they work and then we'll we'll come back to this.

Um, so if we go yeah I just want to pause here for a second. Yeah. So on one end we we talked about type safety.

Okay. So we have like a very typed system where we're saying hey read these you know Wi-Fi locations or whatever you know uh MTA bus locations and all of that. On the other end we want to make it generic.

So we want to load to the map not just buses we want to load buses and taxes and whatever. So how do you get all of these things to work together? by defining an interface that all of these objects uh kind of uh uh implements and then use this interface within our language.

So you get the type safety from the interface but all the objects. Imagine your database had interfaces and you could load any table from your database without knowing in advance what the table you know what's the table name is as long as you know that it always have these three columns or something like that. Yeah.

And and actually cooler than an interface, you know, like if you have an interface in Java and my interface has get name and his interface has get name, we have this problem where well, which get name are you using? Hopefully, they both return string and you don't have a problem. With interfaces in in Foundry, they're actually mapped.

So the the property names don't have to be the same. You're saying to implement this interface, these properties map to this type. And so you can have reuse of of names.

You can implement multiple interfaces that have the same names on them. and you have no problem with that in terms of of what you're designing. So you don't have to change your code as you get new object types.

Um so let's go uh oh it's here. We we'll look at that real quick. Um so here I'm just loading an object.

We're not doing the generic coding anymore. Like I'm just strict downloading an object. Um and it's an MTA bus.

And to go back here I can load this by vehicle. And I'm I'm just showing you the first one. I'm just getting the first one out and showing it to you in this lovely interface.

Um, so we'll save this here. And when I load by the vehicle, it's not going to waste time loading other properties I don't care about. You don't you don't need that.

You're saying I want the vehicle. Um, and there's also some like other metadata on the object like, hey, this is in the context of a vehicle versus it being an an MTA bus. And in fact, we can take an MTA bus and we can tell it to act as a vehicle and use its own mapping.

And as I do this, hopefully, oops, I should have done load the object first. Here, let's do this. Load the object and then I can tell it to so that API name is MTA bus and the object type is MTA bus.

But as I cast it, I guess as a a vehicle, it it changes to be that shape. Um, why this is cool? Because there are a lot of cases where you need the specific objects.

You want to have a form. You need to feel all the properties of the form. But that specific object needs to also load to something that is a generic.

So you build like a generic map. The generic map doesn't care whether you're presenting a bus or you're presenting a taxi or representing something else. So you can build this thing and say, "Hey map, take this as a vehicle and take the other thing as a vehicle and present them on the map while the other part of your application knows more about the specifics of the object.

So you can decide how you play with both of these sides. Yeah. So let's let's go.

I have this plane. There's just one plane in my data set. I'm sorry.

Um but let's have it implement this. Um and first I'm going to show you in the properties. Um I don't know if I can do this quickly.

Like the location is called location, right? It's not called whatever we had it over here. Current location, right?

Um and same there's no last updated field on this thing. Um. Uh oh, I lost my object.

Uh, sorry, one second. Okay, so back to my plane. So, let's have it implement this interface.

Um, so we go ahead and find it. Maybe vehicle. It needs to have these two properties.

And what I'm going to do now is I'm going to say, hey, current location actually maps to location on this object. And last updated actually maps to, let's say, time position on this object. Go and do that.

And we're gonna save it. Yep. [Music] And now we come back to this demo over here.

And my plane updates like every second. So we're going to use that to our advantage to make sure that it loads. Um, so I'm going to tell it I want to load vehicles, but only ones that have been updated in the last 100 seconds.

And hopefully if everything goes according to plan, that updated. And we have an object type of plane. It's a vehicle, but it's a current location.

and the last updated it's not whatever was on that object. So you can use these interfaces to migrate data to new object types. You can use it to support planes and buses on your map.

You can do it for all kinds of various things. It's really really powerful. Um it's going to help make it so that you can build a generic application uh without even knowing necessarily what the end objects are going to be.

And I think it's worth noting here that like this SDK I've generated doesn't know about planes. Like this object isn't in here. Like this just knows about vehicles at runtime as it goes.

It loads the mapping. It figures all of this out and gives you the correct data. Guessing vehicle here is meaningless.

Um, okay. So, we can we can finish that all out. Now that this is a vehicle, we can go back to our our uh map and uh it did vehicle.

So there's there's my one airplane. It's down there in Arizona. Um that's not very exciting as a demo because there's only one.

I'm really sorry. Um my other airplanes are gone. Uh but it shows you that we didn't update this application at all.

Like it just we coded it for vehicles. We had the ability to use current location and location and we don't have to do anything else. Um yeah.

So let me challenge you. I want to run I want to build an application that like I'm a third-party provider. I build an application and I want to adopt that application to various you know customers of mine.

Yeah. How would I code that into my application? Um yes I don't know if exactly but ontologies code you want to do.

Oh I see you're queuing code. Okay. Um yeah, why don't we we switch to the slides and we'll do ontologies code real quick.

Cool. Um so, so the other thing that's coming soon, this is this is a slide because I I can't actually run it for you right now. Um is we're actually going to start shifting this to be more developer uh first.

Um if any of you have done your projects today and you didn't already have data, you found how annoying it is to create your ontology objects to make an application that's doesn't have any backing data. It's pretty annoying. Um, but here we're going to shift to a world where, hey, you're you're doing a dev first project.

You can make your ontology in code, define it, have it built as part of your your build process, make your SDK as part of that build process, and then even later deploy that ontology fragment into a stack using marketplace so that you could say, "Hey, build this one application and have it work somewhere else um with that ontology fragment. When you couple this with interfaces, now things get really powerful. I can ship an app that only knows about vehicles that renders a map like this and it goes to your stack and you install it.

You just make any object implement vehicle and they're going to show up on this map, right? I don't have to know anything else about your objects. So, it's really going to start making it possible for us to build um products on top of of Foundry.

I think right now people can build applications pretty well. This will really start opening up the ability to just code and make a