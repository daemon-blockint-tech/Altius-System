# Palantir for Builders | Forrest Berry, Selkirk Director of Consumer Applications

[Music] Hi, I'm Chad Walquist. I'm an architect at Palanteer. Today I've got Forest Barry from Selkerk who's going to join me and talk about their Palanteer for Builders experience.

Thanks for joining me, Forest. Hey Chad, thanks for having me. So maybe real quick, everyone probably doesn't know the name Celkirk.

What do you guys do? So we are a paddle manufacturer. So we make paddles for pickle ball.

Um pickle ball is the fastest growing sport uh in America right now. One of the number one sports among adults for by participation. Uh and primarily we we make paddles.

Uh but we also um have some things out there to to just grow the sport as well to kind of uh give back in that way and help people to to enjoy the sport. So we've got things like um Selkerk TV where people can can go watch things, learn learn how to play. We've got playpickball.com so that play people can go uh find courts, find teachers and things like that.

Uh and then we've also got uh playmore which is one of the things that one of our first things that we built entirely on on Palunteer for helping people uh play more pickle ball, get out there, organize matches and things like that. That's awesome. Yeah, I know.

My my 70-year-old mother still beats me at pickle ball. It's quite the sport around where they live. I think they've converted all the tennis courts into pickle ball and they are packed all the time.

So I think your the growth of pickle ball and you guys is very highly correlated. Um that's awesome. So I guess the that's the part I'm I'm trying to think.

Okay. So you're you're fast growing company really consumer products. Um and it sounds like you've got a small team.

Like why did you pick or how did you come across Palunteer? Yeah. So about a year ago we we started with Palunteer and uh one of our our co-founders here is very involved with the tech side and everything.

uh Mike, he he had been following you guys for for a couple years and had seen you had come out with Foundry and had started going to more um some more small medium businesses and so he was able uh to to get in touch with you guys. We were able to kind of get a trial run and get started and um look a little bit at this ontology and kind of figure that out and and just start to see some of the power for what we could do when we started plugging some things in there. Ontology was probably the hardest thing for us to grasp at the beginning.

Um, but once we got it, once we were able to kind of click it together uh in our mind and and get that mental model of of what you mean by ontology and how that's it's not just a database, but it's, you know, it's everything connected together uh and really being able to have that digital twin of our company um has let us, you know, put things together fast that would um like we looking at a erd transition uh at some point and we're able to really offload a lot of that work that's traditionally done in erd in our own like homegrown system uh that's built on top of palenteer that's enabled us to really move quickly on that and have processes that are built for our company instead of sort of adapting like best practices which may not be best for our company. Yeah, that's cool. I think that the malleability of it where I still have enterprise scale, I have the guardrails but I can make it work for my company.

I think that's something we hear all the time uh regardless of scale. But the excuse me the the ontology piece that I just wanted to hit on that again for a second because that's generally the the term that people are like what the heck's an ontology why is it different you know I talk about it is the the data the logic and the actions everything you need to make a decision about your business I guess maybe you could just take another step further of in like how are you you said the digital twin of your business process like so you're you're creating one ontology across many different domains and applications or what are you doing? Yeah.

So, we've got just one Selkerk ontology that we're that we're building out. Uh, and it has everything in there for us from, you know, um, raw materials coming in to paddles that are finished to customer orders. Um, and then I'm even using it on the front end for for what we're calling like the pickleball ontology where we have, you know, tournaments and locations and uh courts and players and ratings and things like that so that we're able to kind of map these things together.

Uh, so that we can see, you know, sort of pickle ball at a at a snapshot, but also we can see our our company and how things, you know, how things are working together. I know we we've talked before about some of your um kind of back office stuff. So, you're also using it to like drive picking in your warehouse.

Oh, yeah. So we've got so that's really primarily why we started with Palunteer uh is that that back office side of things. Um so we've got sponsored players, we've got orders, we've got all sorts of things that we've got uh in the Palunteer back end.

Um and we've started building out our own warehouse management suite inside of Palunteer. Um so one of those uh the key one that we've we've really just got up and running is our um what we call our shipping engine. Um, so our shipping engine, uh, we're able to go in and, uh, basically have a queue with automations and and the ontology objects to say, "Okay, when an order like this comes through, send it to this station." And then we've got people in the warehouse where we've built um an app on top of Palunteer where they scan the order and then they start picking the the order and the order has come to them so that the right uh the right materials are are near them.

So they don't have to, you know, walk 200 yards across the the warehouse. It's all right there. Um, and then the automation says, "Okay, you know, our queue has shrunk here, so let's print another order on that printer." So, they don't have to waste time.

They don't have to, you know, come in and print it, wait for the printer to print it out. They just come in, they grab an order, they scan it, uh, they pick it, they pack it, they it moves to its next station. And and we've been able to see, uh, huge increases there with with just efficiency, you know, less steps and and things like that.

Um, so that's one of the ways that we're we're using, you know, objects and automations and then tied with a separate front-end app that we're using for that. Yeah. No, that's really cool.

I mean, I think that when you were talking before about kind of capture the state of things like is a giant state machine essentially and each of these automations and people are moving things from one state to the next and the ontology is reflecting the the the state of everything. Uh, and then you can build all that automation capiece on top of it. So are you using any of the the generative AI features as well?

So we yes uh with a with a qualification that it's coming out soon and we're working on those pieces um right now. So one of the things that actually we're going to the London build camp uh this week actually I fly out to Cool. Um so one of the our uh pieces on there is a CRM tool that we're building out for our sales reps.

So just as an example we've got sort of three primary lines of paddles. Um sort of a good better best uh mentality. So, we have the SLK line, we have the Selkerk line, the Selkerk Labs line.

Um, if you've got an account that's only ever orders SLK, whether it's because of where they live or the customers they service, whatever it happens to be, you probably don't want to come in with like a labs recommendation. Um, but the rep, you know, who's got 250, 350 accounts, whatever it happens to be, doesn't necessarily know that. You know, he knows his accounts, but it's hard to keep that much in your mind.

Um, and so with AIP, what we're able to do is, hey, it's time to service this account. you haven't had a contact with them in three, four weeks, you should reach out to them based off their order history, both off the last time they order. They're probably due for a refresh of, you know, the the SK halo.

You should present that to them and say ask them how their quantity is on that. Um so, so we're trying to do things like that of summarization recommendations and whatnot. Um that's cool.

So, I know you know we're talking about all the different kind of applications and other things. Is there is there a demo we could see of some of the stuff you're building? So later this week, you can go download, you search uh play more pickle ball, and this uh this should come up near the top there.

And so what we're able to do here is uh help organizers just organize pickleball games, help them get out there and play more pickle ball. Um so you what you can do is you can come in and create a session. Um I can Oh, that's cool.

I mean, this is almost like how my kids do their video games of like trying to find a group of friends to go play. So in the real world, this is how you're able to just like create a game and and then start to find people. Exactly.

Exactly. So you can just come in start. Right now it's all based off of like people that you know.

Uh eventually we'll we'll sort of open the door to be able to people make public sessions where anyone could join it. Um but right now it's like hey I can send this into my chat with 20 30 people and say you know first eight to sign up and then we can manage weight lists and things like that. Um oh that's cool.

And so this is built on top of Palunteer. So, you've got a custom mobile app built on top of the ontology SDK. Exactly.

And we actually have an AI side built out for this as well. That's what that session manager was where the AI will will look at the players, look how long they've been sitting out. And this is actually using um sort of the LM AIP logic.

It'll look at the users, how long have you been sitting out, what's your record, what's your rating, and we'll try to pair up players together and and uh teams together. So, it's pair players into a team and then teams against one another to generate the best possible game so that you as a human don't have to necessarily figure that out. You can just say, "Hey, do it for me." That's cool.

And so, we've got that running in uh in here as well. Um this is this is I Forest this is awesome. Like this is really cool.

So, and then on the back end like maybe you want to jump into that or is there something else in the app you were wanting to show? Uh no, let me jump over to the back end. Seriously, that app looks fantastic.

Yeah, I think that's that's going to take off, man. Yeah, we've had one uh one primary developer on that with uh with all that's been there with using Flutterflow and and Palunteer. He's done a really solid job.

It looks really good. Very cool. Yeah, I've I've I've got another Palunteer for builder customer that's um using windsurf with um OSDK and they're just taking the windsurf library throw it in wind and the OSDK library and throw it in windsurf as the context um and all the autod docs and they're able to just basically vibe code an entire app for themselves.

Like it's it's actually getting kind of scary how good that is. There you go. Um yeah, so in the object explorer like this is just sort of the backend view for us.

I mean it's really nice. It was just sort of a back view like we almost don't even need to build a workshop app for this. If we ever need to do some sort of customer support like building a workshop app for this is going to be so straightforward.

All the information is there. I can see the skill level I put in. I can see that this session is actually in progress right now.

Um you know the players that are in there, how it's built out. Very cool. And so yeah, I think that interconnected piece is is so powerful and especially as you're building these apps and features.

It's like it's additive. Oh, I want to build this feature. It's just another ontology object or two and I start you know putting integrating these functions into into your application.

Great. And then uh most of the actions for this we end up making functionbacked um because we have a lot of side effects and things like that. Um but I mean this has worked out really great.

you know, we're able to, you know, throw some interfaces in here. Um, put our, you know, have a team manager where we've got the the AIP built into it or the AI built into it. Um, yeah, we're able to just kind of build together really quickly.

So, okay, we've seen some cool demos, we've seen some some neat stuff, I guess. What's the one thing that you would say you were most surprised by working in Palunteer? Um I think probably two things for us that have you know have really helped us is one is just the um like the depth and robustness of being able to have like we don't have a DevOps team.

Uh we you know we don't really want to do that. We don't have plans to do that right now. Like our when we started Palanteer, our dev team was four um maybe five um because we hired uh we hired another person right around then.

Um today our dev team is uh is about 15 12 you know 12 to 15 and growing a bit here. Um but most of us are working in Palunteer. So when we first started all all four or five of us were um now probably about 12 of the 15 uh are working in Palunteer and we've been able to just to grow rapidly.

But again, we haven't had to like worry about our infrastructure, spin that up. We've been able to just rely on Palunteer for that. Um, which is a huge just time savings uh for us.

Um, and then the other one is just being able to go deep on these things. Again, we've we've been that sort of no code, low code um team for a long time where we've we've built up a lot of stuff and you know, if we had to throw something together and host it here or there, we've done that, but most of the time trying to stay no code, low code. and Palunteer has really allowed us to do that.

But again, over the last year, we've just, you know, exploded um in growth across the company. We've needed to do a lot more complex things. We've been doing a lot more things in code, and Palunteer allows us to, you know, go go pro code and and have a lot of things built out there.

Well, Forest, thank you for uh joining me today. This is some pretty cool stuff and like good luck on the launch of your application. Like everything I see in there, that is going to go like hot cakes.

Um, I I can tell you I know personally a lot of people that will be very excited about being able to create pickle ball games um and manage them and all that, but honestly the the the stuff you're showing me and how quickly with a small team you're able to build both back office and front office like that is really cool, man. Awesome. Well, Chad, thank you very much.

This has been uh been fun chatting together. I appreciate it.