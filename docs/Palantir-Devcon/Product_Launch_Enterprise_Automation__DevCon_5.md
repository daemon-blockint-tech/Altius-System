# Product Launch: Enterprise Automation | DevCon 5

Hello and welcome everyone to our second product launch session. This one is going to be on enterprise automation and we're very excited to announce a brand new product capability called orchestrator. We're also going to be showing some new features around observability and object set watcher which allows you to build live reloading OSDK and workshop applications.

I'm Matt Horses, one of the AIP development team leads and this is Vesh. >> Hey, I'm Vash. I'm a for deployed engineer.

>> So let's chat a little bit about what we're going to cover today. First, I'll give an overview of the workflow we plan to show. This workflow is going to be used to kind of uh give a reason why we need some of these features that we're building.

I I'll talk about why we need those features, what it takes. I'll then introduce the features before we then move to a demonstration and then I'll try and leave some questions uh some time at the end for any questions. So, what's the demo?

The demo today we're going to show is a medical payer pre-authorization workflow. Probably most Americans here are familiar with this, but for British people and other international folks who are maybe not familiar, the way it works in the US if you need to get a medical procedure is you go to a hospital and you say uh you might have some tests etc. And then somebody in the medical billing department has to determine what's your insurer who should pay for this auto, Medicare, Medicaid, private health insurance.

And for each insurer, there are different criteria saying whether or not the person is able to get this procedure due to medical necessity. This is a pretty human-driven process. A human in the building department has to go through all of this and then once they've collected together your clinical notes, they will either call up or send an email to the insurance company to get pre-approval for the procedure.

You should watch out later today. We're going to show a very cool demo about how we can do voice agent automation for that part of the workflow. Today, we're going to be showing it via via the email process.

I've demonstrated this here as if it's a pretty linear process, but in reality, it's a many uh fibrillated process with lots of different decision points. Uh you have to actually have someone making a determination and that's why we need AI here, right? We need to make a determination uh based on the information available.

It can't just be kind of a wrote deterministic process. So, this is what we're seeking to automate. The other thing I want to highlight is that this is just one workflow within a much wider corpus of interconnected workflows across the entirety of the business.

And it's necessary to have those different workflows, those different automations, either humans or agents in those organizations communicating with one another. And we're going to see that in the demonstration. So given that that's the goal, what does it take to achieve this goal of enterprise automation?

Well, from what I've seen from working with you guys, from from our customers, it takes two main themes. The first thing is human agent collaboration. If you imagine a payer authorization workflow, there's some things that AI is just not going to be able to do.

Probably never going to be able to do. It can't give you a CT scan. It's not going to be able to pick up a document, uh, read the notes and type them in and clarify.

We're going to need some kind of human agent collaboration. And because we need that collaboration, we need a shared substrate for uh executing that collaboration. And that shared substrate as a show was showing is the ontology.

The reason why we need ontology is because we want to encode opinion around how those agents and humans collaborate. And we'll see that in the demo. The second thing it takes is a brand new execution runtime that we are announcing and calling orchestrator.

You may remember when I was on stage if you were uh at the last DevCon they announced we started building that and it's now available for you guys to use in the sessions and we'll be walking through that capability today. So what is orchestrator and why do we need it? First off orchestrator enables longunning executions of functions.

A payer pre-authorization workflow doesn't take two minutes, doesn't take 10 minutes, it might take days, it might take months, it might even never complete if the case gets abandoned. So we need to be able to have potentially unbounded executions. Additionally, if they're going to be unbounded, they need to be durable.

What does this mean? Well, it means they need to be checkpointed. It's not acceptable to start right from the beginning of a process again just because we didn't we weren't able to get enough tokens for a particular model.

We need to resume after failure from exactly where we left off. And that is another capability. Interruptability is the third capability of orchestrator we're showing today.

What I mean by that is in order to enable human agent collaboration, we need the ability to pause an execution for a provisionally unbounded amount of time waiting for that agent input waiting for that human input rather. Finally, if we're going to have 10 thousands of these or hundreds of thousands of agents executing millions of executions, we need a way of looking at that. Like as developers, we need to be able to go in and say, okay, well, this one line of this prompt made the a the LLM do this and I need to fix that.

Having that full traceability as you'll see in the demo in a moment is absolutely essential. And so with those as the features that we plan on showing, I'm actually now going to hand over to Vashesh to walk through the demonstration of these features. If we can go demo.

Thank you. Awesome. So I'm going to take on the role of a member of the hospital billing department.

And I see in my dashboard I have a bunch of pre-authorization cases uh where basically a patient uh needs some sort of procedure that needs to be authorized by their insurance company uh or the payer. And I've already gone ahead and kicked off batch execution of the agent uh on all of these active cases. Um typically this would be kicked off via an automate or an automation when a new case arrives, but for the purpose of this demo, I've gone ahead and kicked off that execution via an action.

Typically um now we see here that uh the cases are changing in their status. Uh some of the cases are moving into the agent needs info uh status. So let's go ahead and open one of these cases up.

I'll click on this case. Immediately I'm able to see a highle overview of the case. I see who the case is about, Katherine Blake.

I see who her payer is, who her ordering provider is, as well as a quick clinical summary. Catherine's a 59-year-old female with left rotator cuff tear and she needs an arthoscopic rotator cuff repair. If I scroll down, I can also see all of the clinical documents that the hospital has curated for this case, whether it be radiology reports of the MRI or physical therapy notes.

And I also see that these PDFs and a different agent has already gone in and summarized these documents and pulled out the relevant information uh that'll be required to um address whether the criteria that the payer has set are met. Typically, ordinarily, if I was a member of the billing staff, I would have to sift through all these different PDF documents, uh figure out whether they satisfy these different criteria and summarize and and organize in that manner. But the agent has already done that for me.

Also, if I scroll up, I see that the payer uh Commonwealth Care has set four criteria that they require for arthroscopic rotator cuff repair. The agent has gone in and said that three of these criteria are satisfied by the documentation that's provided. However, one of those criteria, the agent has come back and said that it needs more information.

And uh that's why at the top in the case progress screen, we're able to see that the agent needs more information and it's pulsing here waiting for that information to be provided by the human. >> And this is actually a great point to point out the first feature that I want to highlight of orchestrator which is the ability to use the ontology as that shared substrate. If we scroll down to where the agent is requesting more information, it's a highly specific request.

You may have worked with chat agents where it's just a text box. Whereas this instead what the agent has done is it's created an object to be filled in with exactly the information that it needs. In this case, a document.

Another example it could do is perhaps there's an existing document but it's blurry or um it needs clarification on some strange uh anacronistic medical verbiage or something like that. And so the ontology is how you're able to encode opinion around exactly the information that should pass between the human and the agent. and allows us to build extremely rich UIs from what behind the scenes is a non-deterministic string producing uh agent.

And so I I think that's a pretty exciting capability of orchestrator. And I think we're going to fill that uh information in right now. Right.

>> Yep. Exactly. So if if if you see here, the missing information that the uh agent is requesting is a response uh to this corticosteroid injection.

Basically, it's asking for the injection records uh for this patient. Uh typically as a member of the billing staff I would have to go reach out to a different department in the hospital to retrieve those records. But for the purpose of this demo uh I have the uh document ready to upload.

So I'll go ahead and do that. Once I click uh and I upload this document, a different agent will come in and actually summarize and extract the relevant information it needs to make that determination on whether this document will satisfy that criteria. While that agent is doing its thing, I'm going to move to a different screen to kind of dive deeper under the hood to show you how was this orchestration built.

How was this agent actually constructed using AIP logic? So, I'll go ahead and upload this document and it'll begin parsing. Uh, but in the meantime, I'll move over to the debugger, the actual logic function debugger.

Um and and here in this screen I'm able to see live stream of exactly all the edits and all the different things that are going on behind the scenes that the logic function is thinking about to analyze this case. And I see here that it's pulsing awaiting some object condition. Um to go even further, I'm going to show you the construction of how this logic function was built.

So I'll go back to the editor. Um how this works is first uh we're gathering a bunch of metadata information about the patient. Who is the payer for this patient?

What are the what's the treatment that the patient needs? What are the requirements? What are the different criteria?

But the crux of the logic happens in this for loop. What's happening here is that for each of the criteria that the payer requires for a treatment, we're making a call to the LLM. We're asking, hey, for this criteria, is it approved, denied, or do you need more information based on the documentation that the hospital has curated?

And if the LM says that it needs more info, we enter this conditional where uh where an agent action is written back to the ontology where the agent says, "Hey, I need more information." And the status of the case is updated. We also then hit this await condition that we saw in the debugger where basically the uh agent is saying, "Hey, I'm not going to proceed. I'm going to suspend execution until the extracted text from that document that was uploaded by the human is not null.

>> And this is a great point to point out the second feature and actually the feature of orchestrator I am most excited about which is the ability to suspend execution on some ontological condition. So as Vash was saying what we're doing here is we're suspending and that's exactly what was powering the application a moment ago where we were waiting for further input and that input is that the extracted text from the document is present i.e. not null.

The reason why I care about this so much is that I believe it's an incredibly flexible primitive for building that human agent collaboration. Normally, if you're trying to build some kind of suspension like this, you have to think about state machines. You have to think about cues.

You might have to set up CFKA. You might have to do a whole bunch of complicated engineering behind the scenes. But I can just here with the await condition, I can just express what I want to happen.

I want to pause until this thing becomes true. I don't have to worry about it consuming resources in the background. It's going to efficiently shut that down if it's not been fulfilled within 5 minutes and I can exactly express what I want my agent to do.

And this allow this is much more flexible than a simple text based agent that is just waiting for for you to type another message. So I'm very excited about this. Um and this is a second feature of orchestrator we're showing today.

>> Great. So now if I go back to that debugger to see the live execution of the agent, I'm able to see that it got past uh that await block and in fact it's re-evaluating the criteria based on the uploaded document. And now it's actually hit a different await block.

It's now awaiting an inbound email. And to to show this fully, I'll head back to the app. I now see that the criteria that for which the document I uploaded it is approved and the case status has moved from agent needs more info to now send to payer.

So basically what happened is the agent decided that it had enough information because all the criteria were approved to actually draft a communication to the insurance company. So it send this outbound communication um in the form of an email uh to the insurance company. And I'll go ahead and actually open the inbox that we've set up for this.

And I'm able to see that I have a list of all the prior authorization requests that the um agent has actually sent me. I can go ahead and actually respond to the specific um request uh for authorization. Um while Vashes is typing up the reply to that, I want to highlight the third and fourth features of Orchestrator which are a little bit difficult to see in a UI because they're deep infrastructural capabilities, but I think this point in the demo highlights their existence and their necessity, which is the ability to have longunning and durable executions.

Emails, I don't know about you, takes me a while to respond to my emails. might even take me a few weeks to respond to my emails. The execution that's sitting behind this that's waiting for the email to come back can't simply fail after some kind of timeout.

I need to wait for a provisionally unbounded amount of time for this email to come in. And if the email passing failed, it would be totally unacceptable to go back to the start of the process, require me to re-upload the document and resume the pre-authorization flow. And so I think this highlights the third and fourth features of Orchestrator as part of this.

>> Yep. And we're we're leveraging event listeners here so that the emails are streamed in real time directly back to Foundry. And if I go back to the app, I'm able to see that now the agent has received an inbound communication uh which is like the case has been approved.

And if I scroll up, I can also see that now uh the agent has changed the status of the case from sent to payer to approved. Um and we're able to ensure that Katherine's able to receive uh the arthoscopic rotator cuff repair. So now zooming out I just want to recap what we've shown here.

We've shown that in a quite complex workflow of medical pre-authorization we can have AI be the orchestration layer of the workflow. What that means is an orchestration agent that's able to evaluate criteria await human and external system input that teams up with smaller sub aents that extract information from emails or extract information from documents is able to automate an enterprise workflow. And now I'll hand it back to Matt who's going to talk about how to handle these things at scale.

>> Thanks. We're now going to open up the workflow builder that sits behind this to try and see a little bit about what sits behind the scenes. This is showing me all of the uh automations, actions, functions, etc.

that sit behind uh the agent. So we can see as Vash was saying, we've got the main agent here and then we've got the ability to pass the email as it receives is received from the inbound uh inbox. I can come in here and I can try and figure out uh how long has this been running for um on average, right?

Like what's the P99 of duration? What does my model usage look like? Looks a little bit spiky here because as we were building this, we were testing out different models.

And this should help you figure out, well, is my token usage increasing? Is my token usage decreasing? How much money am I spending on this?

Additionally, I can also come in here and I can granularly search through the logs. So if someone tells me that there's a particular case that didn't go very well or the the LM did something strange, I might need to go in and try and find all the relevant logs for that particular execution and granularly figure out what was the exact LLM requests and responses that were sent back. How long what exactly what prompts are on a line by line level.

And this I think is absolutely essential if we're going to be trying to debug millions of these executions and we're trying to look for that needle in the haststack to try and figure out what went wrong on this particular execution that could have lasted months in duration. And so with that I'd like to go back to the slides and kind of recap what we've achieved and also maybe have time for some questions. So I talked a little bit about what it takes um and I think we've shown a lot of why it requires human agent collaboration in this process.

We then also spoke about that execution runtime, why it's necessary for it to be longunning, why it needs to be durable, the how we can use interruptibility to enable human agent teaming on problems and even agent agent teaming. You may not have noticed but um when we uploaded that email, it was passed by an agent and that agent wrote to the ontology which then triggered the other agent to be able to continue. Finally, observability, showing why, sorry, showing rather how it's possible to manage an enormous system of complex automations uh by using some of the infrastructure that's now available.

And so with that, um I also would like to announce that orchestrator is available for you to try in the build session. So if you would like to try some of these features, come say hi to me and Vashes and we can help get you set up. Um yeah, very excited to be announcing this and uh thank you very much for your