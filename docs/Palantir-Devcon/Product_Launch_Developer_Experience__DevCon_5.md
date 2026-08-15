# Product Launch: Developer Experience | DevCon 5

All right. Hello. My name's John.

Uh I'm going to keep this slide. Uh today I'm going to talk to you about the future of developer experience in Foundry. I'm going to give you a sneak peek of what's to come in the coming months.

Um but first, let's ground it in what we can do today. We're going to go through what it would look like to build one of those amazing full stack apps that we just saw in the mini demos before me. So, let's go through that, right?

The first step is you probably want to start with creating your own ontology. To do so, you're probably going to want to go into ontology manager, click the new new object type button, from there start to give it a name, choose where you're going to save it, give it an add some extra metadata, start to define your properties one by one. Once you've done all of that, you click the create button.

Once you go through that, you finally have something in the ontology and you iterate on all your different object types and links so that you can click the save button in your ontology. Once you've kind of gone through that, you probably want to define your back end. To define your back end in Foundry, that means you need to go create a function.

So, that means you probably want to spin up a new code repo. So, you click that button, from there you pick what language you want to choose, give it a name, choose where you're going to save it, iterate on your actual logic in VS Code. Once you've done that, you just kind of go through the process of tagging a release.

Once you give it a version, you click the right button, all right, the tag and release one. When you do so, checks start to run. And once that's through, you finally have a version of your back end that you want to use.

That means we now get to go create our front end. To do that, we need to go spin up a new Dev Console application. So, we click that button, make choose a new name, choose where to store it, what type of application it's going to be, start to generate a new ontology SDK.

So, that means we need to add all the object types that we created earlier on. And once you go through that, we click the save changes button. And once we do that, we get to generate a new version.

That means we need to choose what language we want to generate the SDK in so that we can finally go and spin up once the generator SDK, of course, is published, we get to create another repo so that we can define the full stack app that we set out to build at the very beginning. Now, that was a lot of clicking, um but it's there for a reason. Uh every single one of those apps, it has a lot of depth and like flexibility and customization built and baked into it.

That is not something that we take lightly. It's there and it enables users across the technical spectrum in all of your organizations to be impactful and able to operate independently, and that's something that's not going away anytime soon. But for developers, is there something else that we could do?

And that's kind of what we're going to flip to and go through the demo. Um I'm just going to show you like the new uh CLI that we've been building and how it all fits in together. So, I'm in my DevCon folder.

Uh I'm just going to run the Foundry CLI to create a new repo, um code named internally as a super repo. Uh I'm going to call my project the DevCon demo. And voilà, in 8 seconds, we finally have the same set of steps that I just described.

Uh so you can see, I already have in code in that same repo ontology definitions, functions built in both in Python and TypeScript, and a full app in React and Vite. I'm going to use whatever tool I'm used to. In this case, I like using Bun.

I found it to be very fast. I'm going to set up my environment. Um and as it like it spins up some stuff, I'm just going to walk you through the structure a little bit more.

Just to remind remind you again, you have an ontology, functions, and app. We can look at the ontology definitions. Again, it's all defined in code.

You can see we have an object uh with some action defined. If we go into the functions folder, uh you can see we have Python and TypeScript functions. And again, the um application is a pretty standard React beat up.

We go back here. In this particular setup we've set up to use NX. NX is just a simple project orchestrator.

It's open source tooling. We're leaning very much on industry standard tooling. To kind of coordinate this.

You're not locked in to anything in particular. You get to choose whatever build tooling you prefer. You get to even create your own templates if you have a something that makes more sense for your organizations.

We can kind of like see the different things that are running. We designed it so that's like hot reloadable servers. As you make changes in whatever components of your project you get to see the outcomes immediately.

Like those feedback loops have never been tighter. In this case we have like the web app that we created. And voila.

You can clearly tell this was built by a back end engineer to demonstrate that we have all these features. So I'm going to create a random product. That means the ontology is already running and this is all running in local host 8080.

The embed using this new technology is called the embedded ontology. It's running straight on your laptop. No need to connect to Foundry to do any of the things that I just described.

We can even run functions again right in code. This case I'm going to calculate discounts in TypeScript and then calculate it again in Python just to flex that I can do both. And and [clears throat] I kind of you can already see like this is pretty exciting.

You have all these things defined in code. I'm going to go through like a more complicated app that I had been like been building for the last few days. It's called Task Flow.

So I'm going to run the same command and spin it up. Um and as that like got sorted I'm going to kind of explain to you what the this project is. It's a simple task inbox with a few different tasks that I have across my team.

So in this case we're going to go through. Um I can feed in some tasks across my team. Every task has a name, some priority.

You can see this number for every single task. Uh this is what I was experimenting with for for last two days. I kind of like we realized that medium, low, high is too simple.

We decided to like implement a custom function that uh calculates priority based on like certain fields in the ontology that matter. Um and I'm kind of going to walk you through like the why we think this new way of like writing your applications is very exciting. by doing two different changes.

So, go to our code. Uh we have this function that I just described like that estimates the task complexity and we've gotten some feedback saying that they would rather uh all the like the estimations are from zero to to 10. So, we're just going to go and make a simple change in code.

And immediately as I do so, the servers are already picking it up. Everything is recompiling. Um and once that's through, the SDK gets generated, the app picks it up, uh and that means if I go back to Foundry like to my app and refresh, voilà, all the complexities are now calculated from zero to 10, which is exactly the goal that I wanted to do.

Um the second version of this that is very exciting is what happens when you make changes to your ontology um and how this propagates across the different components of your app. So, in this case again, we have the ontology, we have some task object, an employee object. I want to show you that like okay, we've come up with this task complexity metric which we're very happy about.

So, I'm going to get rid of the priority property, right? We don't need this anymore. Um and I save this.

Again, if you flip back to my terminal, you'll see that things are already picking up automatically and the SDK is getting generated, which means I get squiggly lines in my actual React app once this is done gone and like generate the SDK. You'll see that now it will freak out that the priority on the task doesn't actually exist. Um once this is through.

There we go. Tells you that the priority property doesn't exist anymore. And now I have much more confidence in how I actually roll out changes to my product as I I to like build uh all the workflows that I want to capture and code.

With that, we flip back the slides. To wrap this up, uh we're building this with the developers front and center. We're so excited to bring this to you.

From like the flexibility into hosting the code wherever you want to do so to those tight feedback loops like local first um we're so excited. Uh I think this like the developers and agents deserve this first-class experience in Foundry. And we're building this with one thing and one thing in mind, and that's developers, developers, developers, developers.

Thank you.