# Building a Patient-first Product with Atlas Care | DevCon 3

Introducing from Atlas co-founders Gabe Seagull and Alex Lupy. Ready? Hi everyone.

I bet every person in this auditorium has probably been a patient and they deeply understand how flawed our healthcare system is. and Atlas is here to fix it. Imagine a world where every conversation in healthcare leads to an improved patient experience.

I'm Gabe Seagull and I'm the co-founder of Atlas and an emergency medicine physician. I'm here to convince you today that we built a powerful application running on Palunteer's foundry that is going to transform healthcare. and I'm Alex Lupy, also an EM doc and co-founder at Alice.

If it's not clear already, neither of us are software developers. We spend our time in the emergency room, but over the past few weeks during this fellowship, we built something truly exciting on Foundry. When we started this fellowship, we wanted to build an IDE for healthcare to give doctors the tools like cursor to build inside the electronic healthcare record.

Our core mission was really simple at the time. We wanted to transform healthcare delivery by putting data in the hands of both patients and doctors. So we started off with data transforms.

Here you'll see some synthetic data from Cynthia which simulates the entire longitudinal healthcare record. We put it into ontology organized by patients, conditions, and more. And with just a few synthetic patients, we generate thousands of data objects that are organized in ontology and surface in our React front end.

After mastering synthetic data, we then went to live API calls from the Epic EHR, which is the most popular electronic health record in the US in order to build a core competency for future EHR integration. When we brought that ER data into Foundry, this really clarified our mission and product vision. AI scribes have really transformed physician workflows and they've honestly made our lives a lot better.

I can walk into a patient's room and there can be 10 patient in that room, 10 patients in that room or 10 providers in that room talking and everything I say is clearly documented. And when I leave that room, I can access that information instantly. But Alex and I began to ask ourselves, why can't this powerful technology be available to patients?

So, my mom got a knee replacement over the past few months, and luckily, she had me going to all of her appointments, being her sort of interpreter, notetaker, navigator. But most patients don't have that. Atlas is that advocate in every patient's pocket.

We capture the visit. We convert it into plain language and then we empower contextual based understanding of the visit to present the next steps in patients care. Healthcare AI is currently siloed.

Critical details are scattered leaving teams to piece together incomplete narratives on patients. Atlas captures the full conversation pushes it to ontology and turns it into a single living piece of truth. So the problem is that clinicianf facing AI scribes are becoming ubiquitous for doctors but patients don't have this and often leave their exam room unsure of what the next steps in their care plan are.

So Atlas changes that our core belief is really straightforward. The richest and most untapped data set in healthcare is the conversation itself. Atlas captures every clinical dialogue and automates this contextual layer at scale fueling a new generation of agentic AI.

So we believe in birectional communication where the data is housed for both patients and the care team under the same hood. So let's log in as a patient. So first off for patients is a place to upload their healthcare records.

We can entologize patient records to make their own personal foundryback electronic healthcare record. This gives patientf facing AI rapid access to the context of medical history without the complexities of EHR integration. This is really exciting.

Next, we can see how patients can actually transcribe their encounter with their doctor and we're going to show you that. >> Hi, Dr. Seagull.

I wanted to talk about my blood pressure medications. I've been running pretty high the last month. I check it daily and it's consistently about 160 over 90.

I've been taking my meds. We'll start in 50 milligs daily and emloopene 5 milligs daily, but it's still running high. What do you think?

Hm. You know, 160 over 90 is a little high for you given your baseline. I think we should increase your dose of emloopene 5 millig to emloopene 10 millig.

>> So, Atlas immediately empowers the patient by giving them access to their healthcare experience by anttologizing their conversation with their doctor. Maybe I forgot the specifics of what Dr. Seagull changed my blood pressure medications to, and I can see that right here in Atlas.

Additionally, maybe I have questions about the rest of my medication list. I can ask about any of my medications here, my insulin dose. All of this is pulling live from here.

We're going to take a look at our backend process for speech to text transcription on Foundry. Hi, doctor. I'm coming in with two days of headache and blurry vision.

Then our transcription will be uploaded to a media set file. Hi doctor, I'm coming in with two days of headache and blurry vision. Once that media set file is uploaded, the new line in this ontology triggers our automation function that when new objects are added, there's live monitoring and it triggers the transcribe and transcounter audio action which is a TypeScript function to trigger the deepgram API to do the transcription for us.

Then as we go over to our transcripts ontology, we can refresh and here we can see our transcription coming through. The transcript text of our ontology object is then immediately accessible on the react front end. Atlas is not only built for the patient, but it's really built for the entire care team.

You can sign in as a patient, a mid-level provider, a social worker, or a nurse. Atlas has something for every member of your care team. First, we're going to sign in as a clinician.

As a clinician, you can see a cue of your conversational data. We can click in and see the full transcript of the conversation between Dr. Seagull and Alex about their blood pressure medication.

they can make sure that they understand every aspect of that conversation. In the Palunteer Foundry, we also we also have opportunities for our multilingual patients. So, as you can see, in real time, every provider can trans can translate each transcript into Spanish, allowing us to have a suite of language opportunities for every patient that a provider may encounter.

What I'm really most excited to tell you about today is our speechtoext options and our voicetovoice agents. Beyond speech to speech, sorry, beyond speech to text, we have implemented the latest agentic voice tools to actively gather information from patients. On the Atlas platform, we have something called voice actions.

Voice actions are voice-tovoice agents that are intelligent. They're informed by the electronic healthcare record and they're able to communicate directly with patients, get information from patients, and build an entirely new conversational data stream. >> So, let's see how a patient will interact with a voice agent.

>> Hello. Hi. I'm here to talk about what might be affecting your health and overall well-being beyond just your medical concerns.

How are you doing today? And would you mind telling me a bit about what brought you to the ED? >> I'm here because I've been living in my car and last night I got broken into and my backpack got stolen.

I had my inhalers in it and so I wasn't able to use them this morning and now I'm feeling a bit short of breath. I'm really sorry to hear that happened. That must have been really stressful.

Right now the most important thing is making sure you're able to breathe comfortably. Can you tell me how you're feeling at this moment and if you're having any other symptoms? Hyperdom.

So, some of you may be wondering, how did two nonsoftware developers build Atlas in a few weeks on Palunteer? We used Foundry's native HIPPA compliant data connections and AI powered idees like cursor to have software engineers on demand. But was really powerful was Palunteer's MCP that allowed us to transform and build a full application in the healthcare space in a few weeks, not months.

So looking under the hood, we built this application on Foundry that is pre-wired for Epic EHR integration with a React front end that talks directly to the ontology SDK. This powers an agentic AI layer that makes Atlas clinically intelligent at scale. Our product roadmap starts with a patient facing app that you saw today.

Then as we gain clinicians on the platform, we get both patients and clinicians to have birectional communication with our voice agents to make this conversational voice data layer. Later, health system deals generate EHR context which adds into all the ontology to get to give additional context to our AI systems. And finally, Atlas becomes the operating system for contextual AI driven by conversational data.

At Atlas, our vision for the future is that conversation is the most valuable data powered by Palunteer. Atlas can do anything. If you're health system partner, we'd love to talk to you.

Thank you especially to the Palunteer team who supported us building this product over the last few weeks. Thank you. [Music]