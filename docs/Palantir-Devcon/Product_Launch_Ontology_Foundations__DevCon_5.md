# Product Launch: Ontology Foundations | DevCon 5

Hello DevCon. Thank you for joining us for our third session, specifically about updates to our ontology foundations. I'm Kevin, one of the ontology group leads at Palantir.

>> I'm Laura. I'm a software engineer for data connection and real-time voice. >> We're both really excited to announce some new foundational features coming to the ontology, specifically that will better support and enable your agentic workflows.

When we think about building new features in the ontology, we reason about them in two separate ways. One, how do we expand the capabilities of the platform? How do you do more with your existing ontology?

And then two, how do we provide you with the proper guardrails so both your users and agents can operate in a secure and safe way? Well, in classic Palantir fashion, I think the best way we can show you this is with a demo. We're going to show you some of our favorite recent features.

And Laura, thankfully, built a notional operating room scheduling app quickly over just this weekend. I think it will use an ontology many of you are familiar with. Nurses, patients, doctors, etc.

So, kick it over to Laura. >> Yes. So, I'm going to take the role here of a nurse.

I'm in the ER. I need to help schedule patients for operations. But obviously, for that, I built an ontology OSDK application.

So, I'm going to log in as a nurse. You guys can see here my OR schedule. I have operations that are going on across different ORs.

But as a nurse, I really do not have the time to sit down in a computer and understand the patient preference, the blood supply, the equipment, the hours of the nurses, the hours of the doctors. So, what if I had all those constraints encoded in my ontology and I can leverage the power of voice agents to help me schedule new patient on this OR. So, shall we try it out?

I have a voice agent here to help me. >> Hey, I've got the board up. What do you need?

>> I was wondering if you can help me schedule Patricia Collins for a last-minute cardiac bypass. >> Sure thing. Let's get Patricia Collins on the board.

How long do you expect that cardiac bypass to run? >> It should be around 3 hours. >> Got it.

That's 180 minutes. Running that through the schedule now. Let me pull up options for that.

Looked at the whole board and cross-referenced surgeon availability, patient preferences, and room capabilities. B fits best. Dr.

Miguel Dubois in operating room two. Three fewer moves than the best outcome option. >> So, before I keep talking with my voice agent, what just happened?

My voice agent has helped me understand the ontology constraints and come up with three different scenarios. But, those scenarios, first of all, they're not ephemeral. I can go around in the ER and come back later and keep editing them.

But, they're also not in production data. I'm not editing the production data. I'm leveraging the power of ontology scenarios, which are data persistent sandbox that allow you to use all your ontology toolbox, your actions, your functions, but without touching your live data.

So, let me keep talking with my voice agent to see if I can come up come up with a solution that I want in production. Great. Can you help me figure out the difference between option A and B?

What are the nurses' hours looking like for those? >> Sure. The difference between A and B, A gives you Dr.

Ico Patel, a top cardiac specialist, but it takes four schedule changes and a lot of reshuffling. B uses Dr. Miguel Dubois, who's not a cardiac specialist, but has a good track record for this procedure, and it only needs one minor adjustment.

Now, neither option adds nurse overtime. All nurses stay on regular hours in both scenarios. >> Great.

I can keep iterating with the voice agent, but for the sake of demo, let's say I agree with the voice agent. I know this doctor and I'm ready to merge it into production. I don't want to be the one responsible in merging into production cuz my role is being on site in the ER.

So, what I'm going to do right now is I'm going to submit it for an administrator to approve this scenario and merge it into production. So, let's say here I want to merge Patricia emergency case. So, let's submit it.

And I'm going to stop my voice agent and I'm going to quickly change hats and take the role of an administrator. So, I have here an incognito window where I'm logged in as an administrator Ashley admin and I'm going to log in. Oh, a new scenario request just came in.

We rename it Patricia emergency case. So, let's click on it. As you can see, the changes the nurses made have been requested for the administrator.

Again, this is an ontology scenario. I can keep editing. I don't need to do and merge this into production just by the changes of the nurses made.

I can keep editing the ontology scenario and use my toolbox of functions and actions. Let's say I have a little bit more context than the nurse and I actually know that Peter patient did not get scheduled for uh for this morning. So, I can actually keep editing the scenario and moving it.

And I can move for instance James Jones to OR two. Once I'm happy with the changes, I'm ready to merge it into production. But before I click that button, my job as an administrator is not just to move things and approve the OR changes, but I also need to notify every single one of the patients that got scheduled to a different time.

So, I'm going to leverage the power of the ontology and voice agents once again. Once I press that approve and merge button, it's going to trigger an outbound call to each one of those patients to inform them their operation or their appointment has been rescheduled. I have a phone over here.

I've hooked it up to be in this case Peter Patient. So, one of the patient that's going to get called is because I moved them, is Peter Patient. Let's approve and merge and see what happens.

So, someone's calling me. I'm going to pick it up. I don't know who this is.

>> Hello, this is the hospital surgical scheduling department calling. Could I please confirm your full name and date of birth to get started? >> Can I get more details around the appointment before I give you that information?

>> I completely understand you're curious about the appointment details. To protect your privacy, I do need to verify your identity first. Could you share your full name and date of birth?

>> Yes, my full name is Peter Patient. My date of birth is January 1st, 1999. >> Thanks, Peter.

Let me check that against our records. Welcome, Peter. Thanks for confirming that.

One second while I look into the details of your appointment. Here are your updated appointment details. You've got an ACL reconstruction with Dr.

Antonio Reyes, scheduled for March 4th, 2026 at  p.m. Eastern Time. Does that timing work for you?

And if you have any preferences about timing or notes for the medical staff, feel free to let me know now. >> Could I get more information about my friend Patricia Collins that I think just came into the ER? >> I totally get wanting to help a friend, but due to HIPAA, I can only share details about your own appointment.

If Patricia needs help, she's welcome to give us a call directly and we'd be happy to assist her. >> Great, then let's confirm my appointment, but can you let the nurse know that I need to be scheduled in OR 2? >> Let me make a note of that.

I'll add that to your file. All right, your appointment is confirmed. The confirmation ID is CONF-7B711233.

Is there anything else I can help you with today? >> No, that's all. Thank you.

Okay. So, a lot of things just happened. I had an OSTK application that was powered by the force of the ontology, and I used voice agents to help the nurse initiate a new schedule.

I've also had an administrator that has changes and approved those changes of the of the scenario and merged into production. Once we've merged those changes into production to your live data, that has triggered an outbound call. I want to take a pause here and make sure that you guys heard that it tried to verify that I was Peter patient before trying to give me any information, as well as like I tried to get information about Patricia patient, but it denied me.

So, keep that in mind. We'll come back later, but I'm going to pass it to Kevin to explain what just happened over here. >> Cool.

Can we go back to slides? So, first of all, I just want to say it was awesome that Laura could build all of that in one weekend. And you might be asking yourself, how did she do it?

Luckily, she had the entire power of the ontology and the existing data asset already in the platform. I want to break down what she used step-by-step. First, let's talk about how this data is secured.

Object security policies is a new feature that allows you to define granular policies on your object types within the ontology. We want to make sure, especially with the sensitive data, the right people can only see the right things. So, let's walk through how this works.

Consider our patient object. It's the object with the most sensitive data. But, it's also the thing you're going to reuse across of your workflows.

So, let's break down how we can permission it differently for the three users that Laura just discussed. First, consider the admin. Their job is to make sure that patients know when their their scheduled appointments are.

That doesn't mean they're providing medical care. They don't need to see that medical information. They're also not doing anything related to insurance or any other information, so they also probably don't need to see sensitive things like your social security number.

The nurse, on the other hand, they are the ones responsible for the care and medicine of their patients. They need to know name, phone number. They also need to know internal hospital information like their risk levels.

Should I be prioritizing this patient? Do they need someone on call all the time? Also, their blood type and other things that are important to day-to-day operations.

Lastly, let's consider the patient. Patient should not see anyone else's information, just their own. They should be able to see their very sensitive information because, well, you got to make sure that's right.

But, on the flip side, let's say for that risk level, that's an internal hospital detail. They're the ones prioritizing patients, and it's not something they necessarily want to expose to all of their patients. This was how we secured all of the objects that you saw within that OSDK app within Foundry.

But, inherently, we had to cross another boundary when we made that outbound call. Making a call to Laura's phone is an external system. So, Laura's going to talk about how the security works there.

>> Perfect. So, the last part you saw making me was me receiving a phone call from uh the hospital about Peter patient schedule. In order to know that, I needed to know that I was Peter patient.

You needed to know my appointment details. So, I kind of want to drill down on the security layers that we've built for those inbound and outbound calls. The first one is network control.

Perfect. You don't want to expose your voice agent to the whole internet. So, we want to make sure that you have the power to determine the network configuration of your voice agent.

The next one is expert controls. You don't want to let the builder decide what data the voice agent has. That data might be marked.

So, you want to make an information security officer of your company be responsible for approving that that data can get leaked over the phone. And that there enough railways on that phone call. The next one is model security.

It's very important that some of you have geo-restricted permissions on your model. So, we want to make sure we comply with those. So, the models that we provide you in the platform to use follow the geo-restriction guarantees that you require.

And the fourth one, as I said, it verified that I was Peter Patient before it tried to give me information about my appointment. And once it verified that I was Peter Patient, it did not give me information about Patricia Collins. So, we've built tools that you can use around your agent to make sure that your agent performs to the standards that you want.

It follows a simple pattern to build both deterministic and non-deterministic workflows. So, I'll pass it to Kevin to explain a bit more of the security of how we did this. >> So, that was just the way we secured your data.

But, what about all of the other tools we use in Foundry? Or, can you show us the workflow lineage? >> Yes, let's go to slides.

Thank you. >> Cool. First, I just want to highlight that that ontology is as simple as I said earlier.

We had operating rooms, we had nurses, we had surgeons, we had patients. The thing to note is because we used ontology-native scenarios, we were able to do all of those sandbox changes without requiring any additional data modeling. Let's look at the patient object for an example of of one of those objects.

So, you can see all of those properties as we described are here. Let's go look at the security to see those property those object policies in practice. You can see we have secured every row of data, as well as those sensitive properties and fields that are specific to the hospital and the patient and their communications.

Going back to the lineage, you can see that we also had a ton of functions pre-built in the platform. These are your back-end tools that were already available and might be used for many workflows. Again, in scenarios, we were able to take advantage of those existing functions because all of those changes weren't just happening on the back-end, they were happening within that sandbox within the ontology.

You could call your actions, your functions, whatever tools you already had available. Let's maybe take a step back from scheduling your appointments, but let's say I need to build even more. If Peter patient needed to cancel their appointment, I need a cancellation workflow.

There are already some functions that let me do that in this ontology, like remove nurse assignment, remove surgeon assignment. I need to build a single atomic function that does all of those things when it gets canceled. I'm going to talk to you about how transactions, the feature we just built, allows us to do that.

Back to the slides. Back to slides. Thank you.

So, maybe I'll set the stage a little bit. As a developer and as there becomes more developers wherever you work building different things, there's going to be different teams owning different parts of your business. Let's say one developer team owns nurses operations, one team owns doctor operations, one team owns all of the inventory.

I just want to work on appointments. I don't want to have to think through all the different things that it takes to reassign a nurse, but I still want to use their existing logic. If I just use it without thinking too hard, I'm going to run into a problem.

Let's say I just run a very simple piece of logic in the front end that just tries to run all of these. I unassign the nurse, I unassign the room prep, but then the call I make to unassign doctor fails. Maybe they had a bug in their code, maybe there was even just a network blip.

But now I'm in a weird state. I built an application that told the user they were canceling their appointment, but I still have a doctor assigned to an appointment that doesn't even exist. This is why we built transactions.

As an engineer, it's incredibly important for me to know that all of these actions succeeded, or if any of them fail, they all fail. I either canceled the appointment or I didn't. So, in the case that one of them fails, because they're running under transaction, all of those changes get canceled and none of them were ever written to the ontology.

We believe for many of developers here, this is a familiar but obviously powerful tool for you to develop with. Okay, we've talked about a lot. Let's summarize.

We built some agentic workflows that were fully leveraging the power of an existing ontology. Specifically, they used voice agents and live audio, and they were able to perform what-if analysis and operations in that persistent sandbox we call scenarios. We provided new guardrails like object security policies and transactions to make sure that those agents operated in a secure and predictable way.

Some of these features are still actively in development, but we made them all available to you in some form on your Dev Con stack. Please try them out during the hackathon and reach out to the two of us if you have any questions. Thanks.