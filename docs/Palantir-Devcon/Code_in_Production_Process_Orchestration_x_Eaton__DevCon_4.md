# Code in Production: Process Orchestration x Eaton | DevCon 4

Welcome everyone to our next code in prod where we're going to be talking about process orchestration at Eden. And I will confess process or process orchestration does sound like a rather boring title, but I promise you it is one of the most interesting and exciting workflows that I have seen from a customer of Palanteer in a very long time. And so to kind of briefly introduce myself, uh my name is Matt Horses.

I lead uh a variety of our AIP product teams. And just to give you a sense of what we're going to cover, first Dakota is going to give an overview of Eden, talk about the workflow a little bit, and then give us a demonstration of the workflow itself. And then I'm going to kind of come back at the end to talk about the brand new product that we're building to enable these kind of workflows to be built faster and more easily at our customers.

So with that, I'll hand things over to Dakota and we'll get started. >> Hi everybody, my name is Dakota Denhoff and I'm a lead developer at Eaton. Um, we'll go to the next slide here.

Um so we at Eaton like to say that we make what matters work. Um you can find our products in airplanes, data centers, factories and various other critical infrastructure applications all over the world. Um a large part of these products that we build are engineered to order which means each unit that we design and build needs to be specific to our exact customer needs.

Um and our customers provide these requirements through various documents um all detailing their specific application. Um, we end up taking these documents and we have thousands of sales engineers all around the world that review, analyze and try to con configure a quote in a timely manner back to our customers. Um, we recently have built out an application uh to help assist our engineers and throughout this process where we're with the goal of reading, interpreting these documents and then feeding information from these documents into our systems.

Um so let's take a little bit of a look at the documents that we're kind of dealing with here and try to understand a little bit of the complexity we're dealing with. Um on the lefth hand side we have a structured text document that that details the exact requirements our customers are asking for. And on the right hand side we have a page of panelboard schedules.

Um and this comes from engineering drawings that our customers provide us. Um you can think of a panelboard schedule as a visual representation of the panel board itself that our customers are asking us to build. And for those that perhaps aren't electrical engineers, if you imagine a panel board, you know, when you get like a power surge and you have to go and flip the breaker switch, imagine that but in enormous buildings, hospitals, on battleships, etc.

So massive scale infrastructure projects. And that's what each of those individual tables represents. Right, Dakota?

>> Correct. Yep. That's exactly right.

And so these documents vary in length and we we receive some specification requirements up to thousands of pages long. And we see receive some engineering diagrams where we have up to hundreds and hundreds of panel board schedules. And so there's very little room for error when our sales engineers are are quoting these particular projects.

And and for that reason, it does it can take up to multiple days for our engineers to read through these specification requirements and look through all these panel board schedules um in order to provide a quote. And so having an AI workflow that can configure, extract, transform these documents and this information within these documents into our internal systems is going to provide a lot of um time savings quality outputs and digitized requirements that can follow in order throughout its entire lifespan and process. Um so now that we've kind of defined the complexity of what we're working with here, we're going to kind of look under the hood and see what it takes to build out an application like this.

Um, and so we can see here this workflow builder. We have our app workshop applications on the far right and then various automations, AIP logic functions and actions that kind of interact with our ontology um throughout the whole process. [snorts] Um, all of our objects that we create for our application here are is north of the ontology, meaning none of them have any backing pipelines or anything to do with data sources.

All the objects are created on the fly as soon as our sales engineers upload our documents into this application. Um each object that we have carries a status property and various actions will update the status property and which will then update other linked objects in their statuses. Um and it's these status changes that then trigger other automations to then execute the next step in each process.

Um this entire diagram that we're looking at here although it's really really complex. It can kind of be summarized into three different defined processes. Um we have the kind of the panelboard extraction phase where we localize find the panel boards, extract the information from the panel boards and then we have the attribute extra extraction where we take a look at the specification requirements.

We we have a set of defined properties that we need to configure and we look for those properties, pull out all the content chunks and then we find a value that we can then send to our internal systems. And then we have a CDN workflow. And the CDN workflow can be defined usually as basically when a customer asks for something that we can't necessarily build.

We're going to take an exception or deviation to that particular uh requirement and we're going to interact with our customers and basically get the acknowledgement acknowledgement from them saying like yep this is good to go. Um so these three kind of defined processes um help us build out a an application for our our sales engineers to use. Um each step along the way has different uh models that we're using.

So we're not necessarily using one internal model provider. We're using various in different models. Um the reason for that is we initially started with one single model provider and we found that in certain specialized tasks we found different limitations and the accuracy wasn't necessarily up to par to to truly give our sales engineers some time savings and kind of the benefits we're looking for.

Um, and so if we go into the demo, we can kind of show exactly what this entire application looks like and and how a sales engineer will use it to to to help them out. And so we land here with a product configuration page. And so our sales sales engineers will come in, they'll create the project for whatever whatever customer we're working with.

They'll upload their documents that they received usually via an email, and then they'll configure a page range. And so these page ranges allow us and our sales engineers to define the scope of pages that they want to look at. Um, so like I said before, these documents can get really really big.

We don't necessarily want to like bog down our models with noise from pages that don't necessarily matter. And so they can come in and scope these down from maybe thousands of pages to just hundreds of pages. Um, the examples we have today are very small.

So you you guys don't get to get a view of these thousandpage documents, but um so we're process we're going to be processing almost every page in this in these documents here. It takes about anywhere between 10 to 30 minutes depending on the number of pages that we're looking at. And from there our our sales engineers will get an email saying, "Hey, your project is ready.

It's ready to go. We're done processing." Um and so the next step for them is then to kind of jump into this review specs page here. And this allows us to um review the document itself um as well as kind of review the extractions and then the content extracted from the documents.

And so on the left hand side here we have our extracted values. These are the values that they would typically actually configure inside our internal systems. In the middle column here we have our content extraction.

So all the content that we found that was relevant to that particular requirement type. And then on the right hand side we have the document with the annotations. So they're able to actually see the source and what the document actually said.

Um users can come in make edits when when needed. So the AI is not going to be 100% correct all the time but it which so we basically give them the ability to to modify to specific values that we we approve. Um and then they can easily navigate the document clicking on the kind of this middle extraction content part and that brings them straight to the page that the content was present on.

Um so this kind of allows them to quickly navigate these documents, quickly confirm the AI extractions and then move from property to property. Um each property has its own tailored unique identification prompt. And so we work closely with the business to essentially create this prompt that says what am I looking for?

And so the current kind of state is they'll control F in a PDF and just type up some keywords. And so we take those those values that you usually use F with and we we tailor a prompt for them and then we have a a selection criteria prompt. And so the selection criteria prompt allows them to say, "Okay, now that I found all the the content that I'm looking for, how do I take that content and actually provide us a value?" And so those two prompts kind of work with each other and they're all ontology objects themselves.

And so we dynamically pull them down depending on which task within the process and then and then insert them into an LLM call along the way. Um, now so this is a little bit of an overview on the specification part, but we also talked about we're kind of reviewing panel board schedules. And so after we're done configuring our specification properties, we're able to jump in and start reviewing the drawings.

Um, once this loads, so the drawings kind of follows a a general process of one, localization. So we're looking for tables within our documents in this particular use case. Um, and then two, classification.

So there's schedules all over these engineering diagrams. They're not all relevant to panel boards. Um you can find switchboard schedules, you can find other different types of schedules.

And so when we're looking to extract a particular schedule, we have a classification prompt that basically says is this the right schedule I'm looking at. Um once we have that confirmation that yes, this is a panelboard schedule, um we go into the extraction of the content within that panelboard schedule. And so this is kind of a close-up view of a panel board.

and what a schedule looks like. Um, it has various row spans, various columns, uh, and complexity. And not all not all panel schedules are the same.

So, there's no standardization across the industry. And, and customers design their their panelboard schedules differently. And we've seen some crazy edge cases here.

And so we have to be able to build out a prompt that it can it can extract this information in a way that's um precise in its output but it can handle like a vague amount of input. Um and so >> perhap for those who uh are are seeing this for the first time as you are on the right hand side there these individual cells are extracted as individual pieces of data from that table there. So what I think's really cool about this is this is not just an OCR, right?

You try and OCR this, you've got absolutely no hope. So it's a combination of using these models to try and extract, as Dakota was saying, not just the granular information, but the granular information in a way that's sufficiently flexible to account for all different possible configurations. And I I think that's pretty unique to what these guys are doing.

Sorry, as you were saying, >> you're good. So yeah, as as Matt said here, each of uh kind of these row spans here and the panelboard schedule can we we output as an object. And so this allows us to fix these fix the like the schedules if for whatever reason the AI gets it wrong.

Users can update, delete, whatever they need to do to these particular objects which we kind of represent as breakers um within a panelboard schedule. They're able to modify those on the fly. And then they're also able to modify information from that header.

So, kind of this information we see right up here is that same information we see in that that header of that panel word schedule. Um, as users go through, they're able to quickly review and mark panels as complete, saying like, "Hey, I've reviewed this. This is ready to go." Um, after that's all done, they're able to then kind of jump into the send to configurator page.

And this is where they're able to see the different panel board schedules they've reviewed as well as kind of look at the specification requirements that they had previously looked at. And after all of this is done, we basically they click a button and it it takes that information, packages it all up into the format that our internal systems are expecting and sends it off into our configurator. And from there, our configurator is able to then um map those values to where they need to go and they can just jump into their configurator, kind of review the extraction a little bit, and then and then send off that generate and send off that quote.

Um this this this entire process didn't come with without challenges. There was definitely challenges along the way that we faced. Um, one of them being was taking our AI extractions and being able to put them into a system that has strict set of rules.

And so not every property that a a customer is asking for, we're able to build. And so there's dependency rules that we have within our internal systems that we need to potentially follow. And the AI is not necessarily getting the extractions wrong, but the customers not necessarily asking for something that we can do.

And so maybe we have property A being sent and then we have property B being sent and property B is no longer valid because of the actual value that property A we sent over was. And so our internal teams have done a fantastic job of handling these kind of inconsistencies on the fly. And so what they do is they take the value that we sent maybe for property B and and upgrade it to a property that we can actually configure.

And so that that continues the quoting process as we go along. And so these we then our configurator then sends this information back to us from a specator uh Genie Joe perspective here. Um and basically surfaces them as mapping errors.

So users are able to tell the difference between our system and then the configurator system. Um another challenge we faced was was identifying when a project is actually complete. And so the reason this is a challenge is we um have so many different LLM calls, so many different functions that are being called throughout this entire process that we might get one or two two failures whether a timeout, maybe we're hitting a little bit of rate limits and it's we don't want to necessarily stop the entire project from processing as it goes along.

Um but so we silently fail these these failures here. Um, these silent failures can sometimes propagate up to to higher upstream ontology objects which can then lead into a cascade of failures along the way and then we get just the entire project can end up in a a failed state. And so even though it's just one minor little failure that that can actually propagate all the way up to the to the final project status.

And so we've done a couple of things. If we go back to the slides >> shoot back one side. Yep.

Thank you. So, we've done a couple of things um to tackle these challenges. We've created a workshop that has each project and its linked objects all the way down to the root node.

And we can see each page as it's processed, the generated ontology objects, the decisions made, and most importantly, we can we have visibility into where a failure state may have originated. Um, not only can we see this and have extra visibility into it, but we also have created actions within this workshop that help us manually modify um, statuses to help potentially resolve these conflicts. Um, it's not necessarily the best solution.

It's very hacky, but it's it's currently working with our our current workflow. We've also set up an autopilot with similar functionality that gives us visibility into the automations, the ontology objects created, and kind of how a document is flowing throughout our workflow. Um, and it's it's only going to get harder for us to kind of keep monitoring this process as our ontology grows with each product line expansion.

And with that, I'm going to hand it over to Matt with the Palanteer team to kind of address what they're doing. Thank you very much. Um, and I think Takakota, probably because he's part of the product team and he's been one of the people building this is being a little bit modest here.

So to borrow like a a Gen Z parlance, I'm going to glaze him up for a little bit. Um, the what I think is really cool about this is just to hammer it home, it's kind of been said, but these previously sales engineers had to take hours or days to understand these documents. But now they can upload it, go away for 30 minutes or maybe even just 10 minutes, do something else, and then they come back and what they get is they get something that they can immediately send to the customer for quoting as soon as they've checked it over.

That's a pretty incredible acceleration of the time to quote. So, I just wanted to I just want to say that because I think that's why it's so cool and Dakota sees this every day, but I want to make that point. And now what I want to do is I want to talk about what we're doing at Palanteer to make it even easier to build and maintain these workflows.

And so with that, I'm excited to announce a new product, Orchestrator, which we're building. And to walk you through some of the features and capabilities of Orchestrator, I'm going to approach things from the perspective of uh what does it take to build these workflows. Well, the first thing it takes clearly is long running executions.

Dakota was talking it takes 30 minutes. I've seen processes take hours or even days to finish. So that's the first thing.

And then once you've got longunning processes, you need these processes to be durable. What do I mean by durable? Well, progress needs to be stored.

It needs to be checkpointed. Uh Dakota was talking about how failures, you don't want to fail the entire process. What you ideally want to do is you want to resume and retry that step.

Probably you're going to have capacity. probably uh Gemini or bedrock is back up again. Now you can retry and you're actually seeing that here in this mock.

So this step here fails. We don't retry the entire process. We just retry only that step.

And what you're seeing here actually uh is an early mockup of the orchestrator UI that you're going to be able to use to visualize the entire process graph and see where you are at in that process's execution. What else does it take? Well, it takes interruptability.

Now, this is kind of an interesting one. Uh, but Dakota was talking about how we need a human to approve the spec before we send it out. This is pretty common, right?

You need some uh asynchronous process. You need something where a human needs to get involved or maybe you've got a longunning model somewhere else in another system. You need to wait until it's finished, right?

You need to be able to interrupt that process. And so, we're adding that capability capability to natively to Foundry. uh and this was rather large mock uh that you can see on here is uh allowing us to pause execution and await an ontology condition that is customized for your workflow.

So this one here is like human in the loop right lm needs some clarification it creates a clarification object with the human response null and then when the human comes into some custom application fills out what it should do the agent can resume taking that human response as soon as it's non-null. Finally, uh it needs to be observable. You need to understand the process graph before it executes, but also whilst it is executing.

Um and so I think you've seen in previous DevCons as well the fact that we're introducing a whole bunch of new telemetry uh span level and uh log line level telemetry for these processes as well as native visualizations of their execution. Uh which is what you're seeing on the right hand side there. We're very excited uh to be building this and we're going to be triing it uh with some early customers uh before the end of the year.

So if what you've seen seems exciting either from the workflow perspective or because you just want to nerd out and talk about the interesting distributed systems problems that sit behind this kind of stuff, I'm going to be moving around uh for the rest of the two days. Uh come find me, come chat. Would love to speak to you guys.