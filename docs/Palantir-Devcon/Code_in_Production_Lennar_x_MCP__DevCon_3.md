# Code in Production: Lennar x MCP | DevCon 3

Cool. Um, well, maybe for the gentleman who just asked about not wanting to click around UIs, I think hopefully we'll answer some of your questions right here. Um, hey everyone.

I'm super excited to be here this morning and share some of the stuff that we've been building. I'm personally invested in this. Um, but I think it's extra special that I'm get to do this with Michael who's one of our closest partners at LAR.

Now, I'm sure almost everyone here has heard about VIP coding. We've heard about it a couple of times this morning and you've probably heard about MCP already and are wondering how do I plug this in in a useful way for us at our organization and we're going to talk about all of this in this session. But I think before we do this, um, I want to make sure that Michael gets to introduce himself.

So, let's Hello everyone. I'm Michael Seaman. I'm a manager of data and analytics at LAR.

More specifically though, I work on our emerging tech team. I manage a group of developers there and the space we live in is doing a lot of MVPs, PC's, anything we can do rapid prototyping um with cutting edge technology. So we're talking about like AI agents, robotics, things like that.

That's where my team lives. And who's this we have over here? You didn't introduce yourself.

Um I didn't introduce myself. I'm Ramsey. I lead the core infrastructure group here at Palanteer, which is a group responsible for infrastructure, but also that works on our developer tools, um, as well as recently our AI, coding tools, and integrations.

Now, um, so I think hopefully what I say next is not a big surprise. We're really investing in developers. This is the third Devcon already, um, in a year.

And when I stood here at the first DevCon almost a year ago, I spoke about our our investments in developer tooling. Um and what that meant at the time was really investing in VS Code integrations. But the ecosystem has shifted massively since then.

We're seeing um tools like cursor and windsurf which were popular among startups make their way in the enterprise. We we see frontier labs create their own CLI coding tools. Um and there's a plethora of VS Code extensions which move from being just you know chat LLMs to understanding your codebase and having increasingly agentic um workflows that help you write your code for you.

Now, I think we've all watched the videos um all over the internet about kind of oneshotting your full application from front end to back end to all of your logic. And they all look super cool. And they're pretty impressive for what we've been able to do with technology.

But one thing that they tend to miss is well, what is the tech stack that I have already? What's the schema that I have already? How do I plug this into the rest of my company's ecosystem?

We already have logic. I already have a schema or an ontology in this case. And how do I bring all of this together so that it makes sense?

it's not just, you know, suddenly decides to use a completely new database. Well, I'm not going to deploy that in production. Um, and luckily, one of the things that they all have in common is is MCP.

And I'm going to talk about why that matters for us um in the context of this conversation. So, what is MCP? MCP stands for model context protocol.

And what it is is it's an open protocol that was first proposed by Enthropic. um but it's been since been adopted by the industry uh both from OpenAI to Microsoft and most of the previous tools on the previous slide and you can think about it as just a contract between your AI client or agent or IDE and your data um and basically platform that you're using. And if you've if you've used one of those MCPs or even better you've built one for yourself, you'll quickly notice that that's really what it all that's really what it what it's about.

It's a very simple JSON protocol. Doesn't have much magic. It doesn't really consider security all that well.

Um, and it's missing quite a lot of context. And so we've discovered very early on that MCP is only ever useful if it's backed by a platform that is powerful. Um, and if it brings all of that into the editor and into um, and if you think about the workflows that you want to implement through this MCP rather than just exposing any tool that you want u, which sounds good on paper but don't end up being useful for you as a developer.

And for our team, what we really care about is how can we boost developer productivity? How can we make sure that u you can stay within your ID, which is something that we always hear about um, and you don't have to go and click around the UI. How many of those processes can we automate?

Um, and so this is where the MCP comes in. Um, and so a couple of weeks ago as we were developing this product, we heard from Michael Seam at LAR and we heard that they had an app in mind and they wanted to test it out. And so we thought great, that's a great opportunity to partner and see if this is indeed useful for developers daytoday.

Um, instead of talking to you about it, I'll let Michael do that. Um, so probably for most of you when you think about LAR, the first thing you think is MCPS, correct? Um, or maybe you're wondering who is LAR?

So, or what is LAR? So, let me tell you a little bit about us. Um, so LAR is a home building company.

We're based out of Miami, Florida, and we're actually the largest single family home builder in the country. One of LAR's core commitments is quality. Last year, we built over 80,000 homes.

Part of that commitment to quality is the multiple multiple inspections we do throughout the home building process. We hit many construction milestones and at each one we're doing inspections for that. So if you want to do a little bit of math, if we do a ton of inspections per homes multiplied by 80,000 homes, we have ourselves a little bit of a scheduling problem.

So my team was tasked specifically with building out a PC for a scheduling application. That application was just going to touch the last four QA or quality assurance walks that we do in order to sell the home. Now the process right now is done manually.

Um there's multiple moving parts, there's multiple parties, multiple integrations. It's a very tight timeline as you can guess. There's a lot of rescheduling.

Most importantly, for the last two walks, we actually bring in the new home owners themselves. So they're doing the walks with our associates. And it's very important for us to get this right every single time.

So for us, a custom solution was necessary. Um, very simply put, if we can't get these inspections done, we can't sell homes. For a home building company, that's that's pretty important.

So, a couple weeks ago, I was in a meeting and one of my teammates mentioned MCPS. And unlike you all here, I didn't have Ramsay with me. Um, so I'm frantically googling, trying to catch up, learn about MCPS.

And of course, as luck would have it, the very next meeting I hop into is with the Palunteer team. And they ask me like, "Oh, Michael, you know about MCPS, right?" And of course, I was very honest with them. I'm like, "Yeah, I've researched it pretty extensively.

I know all about MCPs, especially of the the last five minutes." Um, and it ended up being for us like the perfect partnership. So, one of the things my team does is vet a lot of new technology. So, this was a chance for us to test out the MCP as well as we can implement this as a tool to increase developer efficiency.

So, like I said, it was the perfect pairing. Um, so with that, um, there were a couple things that happened. We had this meeting, we had the schedule down.

I think that was on like a Friday and like su like a superhero, uh, Roit from Palanteer who's in the audience flew all the way from London to Miami. So that was a Friday. And then on Monday, we got to developing.

But now we're going to transition from the slides and go over to the demo because I want to show you all what we built. So, a little bit of context here. Um, so we spent five days working on this.

It was myself, Roit from Palunteer, and Matthew, one of the developers on my team. We started with actually no code. We did of course have Lenar's ontology, but we utilized the MCP to create the ontology for this as well as to develop all the code that we were using.

So, a lot of vibe coding was involved, but like I said, we kind of started with nothing and now here we are. So I'll take you through just kind of some basic functionality of the app. So right now we're looking at just one inspector and you can see their schedule.

We integrated with their calendar. So you can see any external commitments they have. So they like have a meeting or something like that that will show up on the calendar and then you can see also on the right hand side all the scheduled walks that we need as a scheduler who would be our user for this app.

They need to schedule all these walks. We were able to use the LLM and some vibe coding to create our own scheduling optimization algorithm. And so if we want I can go ahead and select all the walks and then I can go ahead and schedule all those with our schedule optimizer.

So it gives me my optimized schedule. Then if you can look through we can see how those are scheduled avoiding the external commitments and I can go through and if I want I can manually change those or I can say hey I like this optimized schedule. Let's go ahead with that.

But for right now, we're just going to leave it as is. The thing is is there is a little bit more work to be done on this application. Um there's a new feature that we want to add and of course why don't we do that live with everyone here.

So to kind of set the stage um first off I do want to mention this is all mock data for our real application. We are using real LAR data. So that means real homes, real walks, real QA managers and schedulers are in there.

But for demo purposes, we took that out. So what I want to show you is this list of inspectors. This app was built with the assumption that every inspector can do every walk or do every inspection.

But that's not the case. Like Joe Young, for example, Joe Young is only certified to do the first two walks, the QA walks. So what I want to do is I want to create badges.

That way when I look, I can see who's certified for what walk and who can do and who's not. So, kind of take a mental note of what we're seeing right here. Hopefully, if everything goes well, when we're done with our demo, you'll see badges next to everyone's name that signify which walk they're able to do.

So, I'm hopping over to my ID. We're going to use VS Code for this. Um, and one of the things here is my goal is just to be entirely in my ID as much as possible.

So, I have a pretty big prompt in here, and we're going to set that working. Um, and I'll just kind of talk you through what was involved with that prompt. So, the very first thing I asked is just create a mock data set for me.

And as you can see, already popped up, created a CSV for me. So, we're all good. We have our mock inspection certifications.

The next thing I want though, I want to create a Foundry data set. So, as you can see, the LLM is starting to invoke some of the tools for the MCP. It's already looking through mytology with that first task there.

The next thing it's doing is it's creating a foundry data set. Now, you may be thinking, I probably don't want an LLM running wild on my ontology, making a bunch of changes, deleting things, changing things. That's a uh that's a good way to get into a lot of trouble.

So, as you can see, the next tool that it invoked is it's creating a foundry branch. So, all the work that we're doing right now will be done on a foundry branch. And that was part of the prompt that I asked it to do.

The next step that it's coming up right now is it's going to create an ontology object for me. We'll use that ontology object to then update our OSDK. But first, it's going to make a PR for us.

It's going to make a pull request so we can approve that. So, that's going to be one of the few times where we do want to have a human in the loop. We want to make sure we go, we look over that PR, make sure everything's good.

I send it to someone else on my team to review my work. So, that's what it's doing right now. And this will be one of the few times where I'm going to pop out pop out of my IDE and we're going into Foundry and we're going to approve that proposal.

Now, normally we would be very meticulous. We would check this over. We've done this so many times and of course because it's a live demo, we're just going to say everything looks good.

So, we're going to merge that proposal. One thing I do want to point out is you can see all the work that it's done. You can see the object it created for us.

You can see the actions it created for us as well. We'll just add in the comments, you know, LGTM looks good to me. Let's merge that proposal.

And we're going to hop back in. So, our next prompt is a pretty simple one. We're just letting it know, hey, I've merged that proposal.

Everything's good. Now, I want you to update my OSDK. So for me, this is actually my favorite part of the demo because this is something where it shows the feedback that we were giving Palunteer.

I know for my developers, we do a lot of development using the OSDK and one of the most annoying things is going back and forth updating your OSDK and doing all that and then going back to your ID and going back and forth. And so we this was some of the feedback that we gave while we were working. And I think I fell asleep one night, I woke up in the morning and this was a tool that they had implemented for us.

So, it's one of those things just to drive efficiency where I can stay inside my ID this whole time. And I'm just going to go ahead and install the new OS SDK. Um, but this just shows like we're the feedback is being heard.

Um, and I very much appreciated that. I know my my developers did as well. So, we have one last prompt.

and we're just letting the LLM know, hey, I've updated my OSDK. I want you to make all those changes to the front end now. Um, so this is the one part of the demo that does take a little bit of time.

Um, so you're going to get to listen to me talk while this works in the background. So, thank you for that. Um, so just to review though, uh, we've done a few things.

We've created mock data. We've created a foundry data set. We created a foundry branch to do all of our work on.

We then created an ontology object. We created a pull request and then we were able to update our OSDK. And I've done all this while I've been talking to you, while I've been presenting.

So that's one of the things where you can just see the type of efficiency gains you can get by utilizing the MCP. So while this is working through, I'm going to talk to you a little bit about my experience. So the first thing echoes back to what I was saying before utilizing this my team we need to move quickly.

We have a lot of MVPs that we make that the business says hey you know what we're just not ready to do this right now. It's very hard to change the way people operate. So we're constantly pivoting to new tasks.

So we need to move quickly. Rapid prototyping for my team is something that we we need to do. And so being able to automate those like mundane and tedious tasks, those things that as a developer just kind of make your life annoying, that's what we're able to do here.

So you can get back to what you like most, which is writing code. And in this case, vibe coding. Um, so that for me was like the the first takeaway.

The second thing is it was on the very first day we sat down with Roit and Matt my team and we immediately invoked the MCP to create mock data sets mockintology objects for us and what that did is I'm a big data guy and so Rohead and Matt they were able to go work on the front end and then I was able to make sure we were getting all the right data in there. So I think it took like five 10 minutes of work before we were able to completely parallelize things. So that for me was like just right away when we started very first day I'm like okay I'm already seeing the value here.

Speaking of data um I was going through I was doing my Python transforms and I know the data at LAR really well but there's some things you like you can't be 100% on everything and so I gave the MCP or I gave the LLM some instructions and it actually invoked this SQL query command and it was validating its work. So it was querying the data sets in our ontology, making sure was bringing in the right columns, doing the right joins and self-checking itself. And so for me, that's something that I was already doing manually and going back and forth, writing some SQL code, making sure I'm getting the right stuff, and then going back and checking its work.

So having that as an option for me, it just made my life so much me so much easier. Um, as for those managers in the audience, you know, we have plenty and plenty of meetings. So, I was able to uh I could work while in a meeting, but then also when I wasn't in a meeting, I could be much more efficient.

Don't tell anyone that I don't work during meetings. I'm always paying complete attention. So, we should be good.

Michael, yep, you may have killed the npm server when you ran the command. Oh, yeah. So, we just need to run that again.

Sorry. All right. Everything can't go perfectly, but we did get the result that we were looking for.

So now you can see Joe Young like we were expecting can only do QA walks and you can see all the badges for everyone else. So, okay. So that's it for our demo.

We're going to transition back to the slides. Um so this is all I kind of talked about this a lot. Um but there's one more point I want to make.

Um so one thing my team does every single Friday we do a demo Friday. It's a half hour long. So this is the last day that we had Roit in town.

And so we made him and Matt, our developer, demo all their work. And I thought it was pretty funny because they had a half hour and I think their demo lasted about two minutes because my team spent the entire rest of the time. So 28 minutes just hammering them with questions wondering, you know, what tools are available, what's going on under the hood?

The same questions that Ramsay already gave answers to about, you know, how does an MCP work? And the reason I really like that because it showed how interested and how invested my team was in using this technology. Um, the one side effect though is all the reward for for Matt's hard work building all this is he now gets to onboard my entire team to this.

So, uh, sorry for him for that, but it's one of those necessary evils. But I've talked for a lot. Let's get it back to Ramsey and you can, uh, tell us about how everyone can get access to this.

Right. Thank you, Michael. Um, so just going to recap very quickly what Michael just showed you.

We created a full feature from scratch. In this case, after the app that was created from scratch, adding objects, adding those to the UI, um, and then combining all of this together. Our goal is really to bring with the full power of Foundry to your IDE, to your agents, um, to where you're trying to do your development development workflow.

Today, we have support for we have knowledge about Foundry, the OSDK, as well as Python transforms. Um, so as you're writing, we didn't show this, but like as you're writing ETL transforms as well, you can do this with your context about your date sets, columns. Um, you can also ask it to go validate after it, you know, your LM is going to write a transform for you.

It will validate the result by running a preview on your data, test it out, and then if you have any issues, it will fix that. It will often read the result as well. So, if you ask, oh, I want those columns to be crudeed by a certain country or filter on that.

Um, it will check that that happened and then try to fix it um incrementally. Um, and so for OSDK development and ontology, we create objects. Um, it supports modifying those objects and I think most importantly, it does all of that on a branch.

so you don't delete your production data, which is not ideal. Um, and then maybe you might be asking, how do I get access to all of this? Well, we have a QR code and I'm going to move out of the way and if you take out your phone and scan it, you'll have documentations for how you install this in cursor or windsurf or client or copilot um or any of your favorite idees.

Most of them support it. So even if we don't list it out on the docs, come talk to us. We can show you what npm command to run in there.

Keep in mind that this is early stages. Um, most of what you've seen here, or like everything that you've seen here is supported. There might be rough, uh, rough edges here, but I think most importantly, and what I like about having worked with Michael and his team, um, we're really focused on developers.

And so, we have a bunch of developers here, you guys, who will help us get feedback. So, as you're testing this out during the hackathon today, as you get access, um, as you try it out at your own companies, please send us feedback. Roit and I are going to be around.

We have a demo booth up there during the day. Um, tell us your favorite tools. tell us ways in which this fails.

We'd love to hear about those. Um, and with that, I think we have, well, we have 5 minutes left, but I think we're done more efficiently, and that's I think that says a lot about the MCV. So, cool.

All right. Thank you, everyone.