# Code in Production: HCA Deploying AI in Healthcare at Scale | DevCon 3

Cool. Um, hello. Welcome back.

I am Siney from the marketplace team and I'm really excited to be introducing Ben and Colton today. Um, yesterday you heard from Raj and I talk about DevOps release management and the different levels of workflow building. And today you'll hear from Ben and Colton from HCA on how they've implemented that in practice.

Um, you'll also hear about their additional investments in that they've made to further enhance the stability of their releases um while maintaining dev velocity. Uh, you'll also hear about their strategies in lower environment management um, which I think is a super interesting model for enterprises with existing production ontologies wanting to set up smaller dev environments. With that, I'll hand it over to Ben to get us started.

Perfect. Uh, excited to be here. Uh we we at HCA Healthcare have a great partnership with Palunteer and and happy to to share our story.

We'll talk a little bit about the the history of our product that we call Tempany. Uh how we manage it at our current scale and then Colton's going to lead a demo. Um so HCA Healthcare, we are a large healthcare provider in the United States.

We have 186 hospitals, 300,000 employees, 100,000 uh nurses, and have the privilege of taking care of 42 million patient encounters on a given year. Um, and after COVID, we realized that we had an opportunity. Uh, we needed to kind of advance further along our digital products and digital workflows as as technology has gotten better to take advantage of of kind of the the shifts in AI.

And uh, we wanted to start with staffing and scheduling. And the reason we did that was uh people are our most valuable resource. Um they're often a kind of constraint with growth and we wanted to have the right people in the right place at the right time.

But in order to do so, we needed to kind of go back in the scheduling process and build the best schedules possible. Um and so we started um and we were kind of looking at vendors. We we tried to do this internally and we're kind of we were intimidated our scale.

We we reached out to partners. A couple vendors actually told us no. Um, and then we we kind of found our way to Palunteer and became fast friends.

Um, we started our contract with them in January of 2023. Uh, we started with just one department. Um, and fast forward two and a half years later, we're now in almost half of our hospitals, 1,800 departments.

Um, and the one thing that has made stayed constant throughout this whole process has been this commitment to be on site. Um I I think about uh why the partnership has gone so well is because going into this we both had the same approach. Uh in healthcare we have complex workflows that is being driven by the people doing the work and it wasn't something that we were going to be able to design in a central location and just push out and and have the adoption that we were looking for.

We needed to go on site. And so uh that's something we still do today. We prioritize today uh because that's the key uh to understand the kind of the complexities.

And so, um, we think about our solution, we call it Tempany. Um, what we're doing is we are generating a schedule for our nurse leaders. That's a process that they were doing on a monthly basis.

Um, if you think about an organization, we have over 3,000 nursing departments. Every four weeks, they were spending 15 hours on it. We've got that process down to two hours.

Uh, once that schedule gets posted, uh, life happens. People leave the department, volume changes, whatever it may be. And there's changes to the schedule that happen and u we call it decision support but we're making recommendations what is the NESB's action for our nurse leaders uh to do so.

I think what makes our solution unique and and why you see the the big numbers on the screen behind me with some of the users is uh Foundry is more than just an intelligence layer for us. It is truly the operational source of truth. It is our operating system.

our staff nurses are going into Foundry to enter when they want to work. That's how they see their schedule. It's how they do PTO requests.

Um, and if you think about our journey, and I want to highlight OSDK here. Uh, when we started, it didn't exist. Um, and kind of as we've moved along our we started, our first priority was speed.

We wanted to build something quickly. That was something that really attracted us to Palunteer. But, uh, the pre-built widgets were great for that.

But as we our scale grew over time, we needed to uh kind of have some of the nuances that the pre-built widgets didn't give us. And and that's where OSDK came in. And so uh we started to make investments in high visibility workflows where um we've built them customly in the kind of custom React and then they're being uh leveraging OSDK in the back end where we can have custom workflows.

And then we'll also talk about how we've leveraged OSDK for a mobile app that Colton's going to deliver here soon or demo here soon. Um the other thing that I want to highlight is OSDK did not just give us uh UI UX benefits but also benefits to the solver. Uh so that schedule generation that I was talking about when we first started it was taking us about 40 minutes for someone to click a button um and then output the schedule.

uh that was largely due to some of the like memory of the inputs that was needed. Uh we were calling in multiple data sets that had uh large data sets and because we needed to parse them down to uh the information just for that department um and then also write back to those data sets for just that department it was taking a long time. We were doing it in batches but uh it wasn't just as efficient as possible.

And so because of OSDK, we can kind of call read and write APIs to parse down to information just what's needed. Um, and we're able to go from that 40 minutes of where we started to 2 minutes. Um, that's an a change that we just had in the last two weeks, but has been uh really felt uh as we kind of implemented on site.

And the other thing I want to highlight on this slide before I move forward is uh we've maintained velocity. Um, at the beginning it was really easy to make changes. We were on site with the 20 users that we had.

We were talking to them making the changes live based on feedback that they were giving to us. We can't do that now that we have 3,000 4,000 nurse leaders um 40 4,000 or 40,000 staff members. And so, um, we're still making kind of four PR pushes a day in production, but through the ability to, um, branch them, put them into certain facilities, but not others, uh, we can do so in kind of a safe manner that's not impacting the majority.

Um, I think another thing that has made our process work well is the ability to onboard kind of the HCA support and team members to this process. Uh we started we were heavily resourced by Palunteer. Uh they were the engineering team but over the kind of the course of time we've really matured.

Um we've been able to build out an internal development team. Um we've been able to build out service central which is our kind of ticket support system and they're not just intaking tickets but they're able to action on on some of those things. So our level two and level three has been able to uh act on the volume and and when you have the user base that we'd have uh there was a point in time before we onboarded them when we only had nine facilities that it was overwhelming to the the engineering team.

Our dev team was overwhelmed with day-to-day tickets and issues and questions uh that they couldn't focus on the work. The other thing I would call out is our implementation team. Uh we have a whole team that's dedicated to to rolling this out across the organization.

With our size, we can't just build a solution. it's a whole another animal to to take that one solution from facility one to facility 186 and they've truly become experts. They're also a great le liaison to the team um and also a feedback loop for us.

Um they are there every day implementing at sites running into new challenges, new workflows that they need to accommodate and they're bringing uh that pathway and and feedback loop back to the development team of of how we can make Tony better. Um, the last thing that I'll call out that I think has worked well for us is what we call innovation hubs. And this is these are real hospitals that we partner with within HCA.

Um, we leverage them to test products that may not be fully ready. Um, so they've they know the agreement. We we do a lot of testing with them where we can bring something that may be 85% of the way there.

We're going to offer them a lot of on-site support and extra hands-on training and learning, but we can start that iteration wheel really faster. uh much faster than waiting till something's built and then rolling it out. Um going back to the commitment by both teams to wanting to be on site, this gives us that avenue to get feedback really quickly.

Um as well as very honest feedback. We we have great relationships with these sites that we attend often and they are they trust us. they they know that we have this shared vision in mind and um it's been good to kind of see that relationship build out and see the relationship between them and the developers to really help us make this process better.

Um the last thing that I've kind of led up to now is moving what we call this like iteration stability curve. Uh probably when we were around site 9, stability became a big priority for us. we no longer could kind of be uh just making changes on the fly.

We needed to offer stability to the organization. Um and we we've made sign u like intentional uh investments and and processes or into the platform to help support this. I would also say that the the Foundry platforms really plugged in well to the existing monitoring things that our IT organization already had.

uh we used Datrace, we were able to plug that in. Other kind of support and monitoring tools we were able to do as well. And so if you look at kind of where we are two years later, uh we still in very localized areas will test pilots in production at certain departments and make changes on a daily basis, but because of the investments we made in the platform, we can do that with even more stability that we had than two years ago and honestly probably faster as well.

Um but then at the same time 95% of our users are on this stable monthly releases. Uh stability is their number one thing that they're getting. They're getting consistency.

Um and the core functionality is not changing. There's other internal dependencies within HCA that that leverage Tempany for that information. Um and so we we don't touch those parts of the ontology.

we don't touch those workflows um unless there's a ton of communication around it and kind of included in that monthly release with Timony and and Foundry um being the the operating system for our staffing and scheduling. Uh stability is really important and so um we've invested in downtime procedures where if we have a downtime we can send the schedules out in 15 minutes so we can hit a button email blast goes out with the current schedule the next schedules. Um, it's investments like that that give us confidence.

Um, as well as tracking kind of quarter overquarter stability. Um, and so with that, I'm going to turn it over to Colton who's going to give a really cool demo about um, the manager project that we did on the mobile apps. Perfect.

Thank you, Ben. So, as Ben mentioned, um, we've been on this journey with the Palunteer team for a while now. And about eight months ago when when the web version was um progressing and kind of maturing, the leadership team at HA came to us and kind of tasked us with bringing functionality to the nurses anywhere.

Um and so what that looked like was was a mobile app. And as Ben mentioned with the OSDK, we were able to make that possible. So we brought on a consulting company um that was able to build an MVP mobile application in three months um with the OSDK they didn't even have to touch pound uh Foundry Palunteer at all.

Um so they were able to do all of the development and hit those functions with the APIs and build that and get us to MVP in three months. After that, uh, my team took over, um, and we've been able to keep the speed, um, that we were able to do because of the OSDK, um, to where we are now 5 months later, we're already on release 7 and delivering functionality to the users and having that functionality in their pocket. Um, and then as Cindy mentioned, what we we kind of have like a from the presentation yesterday, we kind of have like a a mixed approach in how we manage this and how we're able to kind of keep that speed.

Um, so what we do is using foundry branching, workshop versioning, and unit tests. We do all of our stuff. We have like a code first approach in production.

So, we're able to do a lot of that stuff directly in production and then we do weekly releases back down to our sandbox. What that allows us to do is kind of going back to the consulting company that we brought in is that they were able to go in there and and do development as a thirdparty vendor against that sandbox environment while still working with like a production ontology while working with production-l like resources in that kind of one ontology space. um that gave us a lot of agil like a agility and brought us kind of to that speed to market and and allowed us to do that.

Um so now what I'm going to do is I'm actually going to switch over to my laptop and kind of talk through the mobile app. So one of the things that we wanted to do from an HA perspective with this mobile application is we wanted to be able to use our own design system. So UIUX um it's very important within HA.

We have our own COE for it. Um and what the way we were able to accomplish that is building a React Native with the OSDK. And what that kind of gave us is this React Native app uses Expo.

So we can do front-end development one time and deploy it to both Apple and uh the Google Play stores. and it uses an atomic design methodology which will then also go back into a neutron SDK which is the HA design system. So, not only do we have the OSDK, but we also have our own design SDK, which allows us to go to any mobile app in the future.

And the main part of that development is going to be the TypeScript functions to make that available in the OSDK. It allows us to to bring mobile apps to market way quicker than I think anybody within the HA sphere that's not using Palanteer as a backend. So, uh, super excited about that.

And then I wanted to kind of show you guys some metrics. This is kind of just some user metrics from the Apple Play Store. Um, you can kind of see as we're growing, as we're kind of expanding and going out into different, uh, hospitals, uh, and the web version is bringing that, we fall closely behind, um, and and release our our app along with that.

And then live demo. So bear with me. This is the mobile application.

Uh this is hitting our sandbox environment. So it's all notional data. Um but you can see it's it's a pretty slim application, but it it gives our nurses the ability to manage um their workforce.

So it's it's for for the managers, uh the leaders at the hospital. They can see kind of like their day-to-day daily roster. They can see who's working, who's on the schedule.

they could add staff um if they see somebody missing. So, it'll allow them to kind of go in there. Um and then they can also go in and check like the shifts that those people are working and see like what their FTE commitment is over that schedule period.

So, they're hitting the metrics. Um allows them to swap shifts with with people, modify the shift, uh move them around, manage them how they need to. Uh, and then the newest functionality that we've kind of put in here is a time and attendance.

So, this brings in the other piece of allowing them to kind of manage their resources. Um, so they can kind of see if they had any attendance occurrences in that day or that that schedule period. And then it allows the staff.

So, we have another mobile app that the staff use that they can challenge if they have an occurrence. they can challenge those and it comes straight into this to where the manager can look at the challenge and either approve it, escalate it, any of that kind of stuff. Um, and then they have a my unit uh view so they can see all the resources that they have within their unit.

And that's the demo.