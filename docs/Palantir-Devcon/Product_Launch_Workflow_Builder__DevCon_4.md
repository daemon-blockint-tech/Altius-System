# Product Launch: Workflow Builder | DevCon 4

Hi, I'm Helen. I'm a product manager at Palunteer. >> Hi, I'm Rahul.

I'm a software engineer at Palunteer. >> So, over a year ago, we realized something in the field. People were building increasingly complex workflows, but managing them became more and more difficult.

You had to go through multiple applications, make sure everything was wired up correctly, and if you change something in one application, you needed to make sure this didn't accidentally affect something later on in your workflow. People were building powerful things, but management was a challenge. So, our initial instinct was actually to see if we could make workflow building easier for users.

Maybe these workflows didn't need to span across all these applications or be this complex. But as we talked to more and more users, we kept hearing the same thing. Users were asking, "How do I see what's going on in my existing workflows and what's connected to what?" And this is how workflow lineage came about.

So workflow lineage is an application in Foundry that gives you clear visibility into all of the underlying resources and connections to your workflows. So this has brought a lot of value to the field already and I'll jump through a few examples that you guys might already be familiar with. So a lot of production workflows have very powerful objects backing them and these objects have a lot of properties.

So to make it easy to have you guys see all of the downstream usages and also see which of those usages actually edits those properties, we have a side panel in workflow lineage so that you can see this all in one page. So the next time you're debating whether you need to delete a property, come to this page to make sure that you're not accidentally deleting something else further down in your workstream or affecting something negatively here. Now, let's say you've built out your workflow and it's successful for your team and now you want to extend it to a different team or across your organization.

Workflow lineage makes it easy to see permissions and edit permissions all in one page. So here you can actually see every resource as any user on your platform. And because of the two-way linkage between the graph of resources and the application, you can actually see the exact button or widget that's affected by someone not having permissions to a specific action.

And for all my builders in the room, we know it takes time to continuously upgrade and enhance your existing workflows. So we have a suite of bulk update functionalities that you can use to save you guys time. So if you need to bulk update functionbacked actions, logic, workshops, or you need to bulk delete actions for a cleanup or migration, you can do this all in one go in workflow lineage.

And finally, if you need to track your AI and LLM usage for your workflows, and you want to answer questions like where even is the AI in my workflow? Is my AI usage going up? Am I hitting token rate limits?

You can answer all of this using workflow lineage as well with our model usage charts and our model usage coloring legend. So even just with those few features that I've highlighted, workflow lineage has clearly made a lot of users lives easier in the field already with existing workflows. But what about our initial problem of how do we make workflow building easier for users?

Let's take a quick example. Let's say I want to notify someone when a outage alert with high priority comes in. So in plain English, this is pretty straightforward.

When an outage alert comes in, see if it's high priority, and if it is, then notify the user. But in Foundry, this can seem pretty complicated to set up. If you're new to the platform, you have to know to define the outage alert object first.

write an write a function to determine the severity, wrap that in an action, create another action for the notification, and after all that, you need to create the original automation trigger to actually start this whole workflow. So there are a lot of apps that you have to jump through and you have to make sure everything is connected correctly. So to help you guys with that challenge, we're introducing a new app called Workflow Builder.

So workflow builder is a new application built on top of the existing backends of automate logic functions and actions but you get all of this functionality in one page as well as an end-to-end suite of endto-end testing tools. And so to give you guys a sneak peek and live demo of this right now I'll be handing it off to Rahul. >> Sweet.

Thanks Helen. All right. So, before we get into building, I'd love to give some context on what we're about to build.

Let's say we represent a power supply company and we use this dashboard to track our outages and even take actions like modifying severity or resolving an outage alert. Now, there is a lot happening in this workshop. So, I'll press command I and we'll enter workflow lineage.

Workflow lineage gives us all of the objects, links, and actions that are powering the data of this application. And one thing I notice here is that there are a lot of actions. There's a lot of manual work that our employees have to do.

So they enter our dashboard, they track new outages, and when they see a new high severity outage, they have to do steps like texting out to an on call responsible for the outage. that takes a lot of time away from solving the outages and spends a lot of time on the triaging steps. And we should maybe automate these processes so that we can get away from the triaging and spend more time on what matters.

So we could use automate to help us automate these tasks, but I'd love to show you how workflow builder helps you build quickly and efficiently. [snorts] So let's jump into workflow builder. What I want to build today is a simple flow that lets us take in an outage alert that kicks off a process.

We'll determine the severity of the outage and we'll at the end text the on call provider that I mentioned earlier. This is just going to be one simple case, but as you'll see soon, we'll jump into the real complicated bits after this. So, let's get started.

What I need to do now is I need to start from an outage alert. So, we'll grab our outage alert, and that'll kick off the process to get things working. Once I have our outage, we'll determine the severity of the outage.

I need to see if the outage is null, and if the severity is null, then we should run an LM to determine what the outage will be. So, I'm using an inline LLM here, but if you have existing logic functions with prompts that are already existing, then you can plug those in as well. and we'll have our LLM give us a severity.

We'll say give us a medium, high, or low severity. Now, this is a pretty simple prompt so far, but as I mentioned earlier, you'll get into the more complicated prompts and the bits when we go into our enterprise example. Oops, sorry.

All right. So, now our LLM is determining the severity for us and we can move on to actually getting that severity back onto our object. One thing that is really powerful about workflow builder is that we're backed by all of the objects and actions in the ontology.

So you can persist that data and make sure it exists even outside of this exact view. Okay, so let's just recap what we built so far. We've taken an outage alert which kicks off a process.

If our severity is null, we want an LLM to determine the severity for us. And we'll put that severity back on the object for later use. So, this is looking good so far.

And I want to actually send that text out. Now, what I'll need is an LLM to summarize the text for me. So, we'll say summarize for text.

Um, and you know, max 100 words so that we don't overwhelm the on call. Sweet. And then once our LLM has that information, we'll again edit the ontology to add that back on to the object.

And now we can send that text. So let's send a text out. And I'll send it Oops, sorry.

I'll send it to we'll have the LM as our text. And we don't have a number yet. And so that's important as well.

Now I know that our outage is linked to an employee. So I can actually traverse the link from the outage to the employee. We support using any code repos function.

So you can write code to do this yourself. But we also support logic and pipeline builder style transforms and expressions. So here I can even use an object set uh object search around and we can traverse from outage alert to our employee here.

Oops. Sweet. So now we have our employee and we can even have that number in there to text out to the employee that we selected.

Great. So in just a few minutes I've built out a fully functional workflow. I can even publish this and test it out as well.

If we go back to our workshop earlier, I can create an outage alert and we can walk through how it affects the system. So here I'll create an outage alert and we'll say that the severity is uh we'll just remove the severity because we know our workflow will determine that for us. I've prefilled the description for us as well and we'll assign it to me so I can get a text at the end.

I'll submit this once it's submitted. You can go back to our workflow and I'll walk you through what's about to happen. So our outage will kick off this workflow now.

We'll determine that severity again. We'll use an LLM to get that severity for us. And afterwards, we'll have a compute that or we'll have a compute that traverses the link, gets us that employee.

We'll then use an LM to determine the text to send and then we'll send that text in the end. And you can even see that it's running right now from that outage I created in the workshop here. So, it's currently running the published workflow.

And we can even go further. And while I'm building, I can even see what would happen. So I can go into preview mode and I can select an outage and we can actually see it flow through our system and you know it goes through and we can see the exact path it took and exactly what's happening at this at this exact moment.

So in this preview I can see that we got a medium severity alert and it's talking about a database outage in New York. Now I did assign it to myself. So, if we check my text right now, it does look like I have a global outage and it looks like it's, you know, affecting New York.

So, I don't know if you can I can show the text, but it's probably for everyone to see. I'll I'll go into a more interesting example soon, but it does work and that's great. So, this is just one simple case though.

And what about what an enterprise might actually build? We can switch over to that as well. Okay.

So, there's a lot happening here. Uh, this is four connected workflows and they are working together to build out something similar to what our workshop was doing manually before. So, I'll kind of explain a bit of what's happening.

We have our first workflow that takes on-site reports. These are reports that are happening on site. Our employees are currently building architecture uh infrastructure and we need to understand exactly what's happening every moment it happens.

So we take these reports and we triage them. We check for delays or shortages or even outages and we're able to depending on the triaging step take a set of actions. For outages we are going to take that description determine what the outage actually is and then create our outage alert.

And that kicks off our second workflow. Now, here we have an outage alert that kicks off and it does something fairly similar to what we just built. We determine the severity.

We text out that on call, but it also does a bit more. We're also deploying a survey craft on the scene, so we understand exactly what's happening. We're determining what to send to customers.

There's an outage, so we want to make sure that we're notifying the affected customers as well. And so, we have a lot of interesting bits happening here. Now, what's really powerful is that all of these different workflows access different parts of the platform.

So, here we have our text and email flow that accesses our notification integrations. So, we can send out that text or even emails for medium or low severity very easily. And when we get new high severity outage alerts, we're using our ontologies roles and team structures to auto assign tasks and owners for the outage.

Even when we're triaging these on-site reports, we're making sure our operations and compliance are up to date and centralized within Foundry. So, there's no need to juggle multiple systems. Everything's all in one place.

Now, there is a bit going on here. And as we keep expanding our enterprise, it'll keep growing. So we want to make sure that there is a good way to understand the observability of your system.

severity outages and I can track how those are currently operating in our system live. I can even track failures. I can see what has failed so far and determine how to fix it.

And if you are expanding your enterprise, we even support creating new categories. So here, let's say we're expanding past New York into London. We can create a new uh watch list and here we can say London.

And we can even track how those how those objects are flowing through our system. We can say what's the site? It's London here.

So if I save this, I can now track that there's five new outages. And as I keep building and changing my workflow, I can see how that affects the watch list here. and how easy it is to test while you build.

We also saw that you can even in production track what the objects and uh you know data is flowing through the system and make sure that everything is working. There's you know testing your failures and edge cases and while we're still a pre-launch product we're very excited to hear feedback from all of you. So we're hosting two canary uh three sorry three canary sessions and uh over today and tomorrow and we'd love to see you there.

So you can see how workflow builder isn't just about building one-off automations. It's connecting the core building blocks of the platform to drive real end to end change. Thank you.

>> [applause]