# Product Launch: AIP Agents and Ontology-MCP | DevCon 4

Great. Hello everyone. We're super excited to be here today.

Um, we're uh going to talk about building ontology connected agents with agent studio and ontology MCP. My name is Natasha. I'm a group lead here at Palanteer on our agents team.

>> My name is Aron Witken. I'm a PM in the OSDK and MCP team. >> So, quick poll of the crowd.

Who thinks Palanteer does agents? Okay, >> only the Palunteer stuff. [laughter] >> So that's good.

That's why we're here today to convince all of you um that we are enabling agents both within the Palunteer platform and outside of the Palunteer platform all backed by the power of the ontology. So what we're going to do in this presentation is we're going to actually build up this entire diagram that you see here. We're going to build an agent studio agent that allows you to rapidly prototype build within Palunteer.

We're going to take that agent. We're going to deploy it into a third-party application. Maybe it's an existing application in your enterprise.

And then we're going to show you that you can use any agentic framework that you want that's on the market today with OMCP as the way you can bring that into your ontology to those agents. Cool. I'm excited.

So um back at DevCon 2 we launched Agent Studio. Agent Studio is Palunteer's agent builder in the um platform. It allows you to rapidly prototype.

It allows you to build your agents where your your ontology is and it also allows you to take those agents to production. But since then a lot of agent frameworks have come to the market. You've got Anthropic SDK, you've got Versell, Microsoft Copilot.

how to name your FA framework and we want you to uh leverage the ontology in all of those agents that you're building. So what we're going to do is actually take the same ontology and we're going to deploy it with multiple different types of agents. The ontology we're going to be working with today is very simplified for the purpose of this demo.

We're just going to be creating a project tracking system. So we're going to be working with projects. Each project has tasks associated with it and those are assigned to people and then we have reports that we write on projects every week that say the status of the project.

So very simplified for the purpose of this demo. And why is it crucial that the ontology is actually the backing system for all of your a AI agents whether they're in Palunteer or outside of Palunteer? Well, the ontology is your data, your actions, and your logic.

It's the verbs and nouns that make up your business. I feel like I don't need to tell you guys that's why you're here. But the ontology is a crucial aspect to building um both workflows that humans can operate on and AI.

So in this case, our actions that we have are basic CRUD operations on our object object types. Maybe we can update a task, create files, create projects. We also have logic to calculate the cost of a project.

And you can imagine that if we were to actually deploy this simple example in practice, it would start to explode in complexity. So our ontology would have maybe tasks or sorry would have sprints, epics, teams, groups, uh lots of things and all of the semantic meaning for how of each of these entities relate would be stored in our ontology. So the first demo we're going to show you today is actually building an AI agent in agent studio on top of this.

And this is the base foundation that allows both AI and the humans in your business to operate on top of. Cool. So, let's actually jump into the demo to build out our AIP agent.

So, what are we going to have our agent do? Well, we've got a project tracking system. Let's say I'm just a project manager and um what we have is an all hands that happens every Monday where we get an AI generated transcript.

This is coming from like Zoom or Teams, let's say. And what we need to do is take that transcript and actually update our project system so it reflects the latest state of the world. So here I've got our project tracking system.

And before AI, before agents, maybe I'd come in here, I'd add a project, add a task, edit certain projects and tasks based off of the transcript. Pretty repetitive, pretty tedious. This is actually something that um would be really good for AI to help us with.

So I've already built out an agent in Agent Studio that does this. I'm just going to kick it off while we go under the hood. So, I'm gonna bring in the transcript.

You can see it here that I just showed. This is from the all hands meeting. It's a hour-long meeting.

And we're going to see that our agent is start going to start to um query the ontology. It's going to look for those projects, those tasks and files, see what the current state is. And it has all of the actions that I would have in this workshop dashboard, but the agent can now do them.

So it can delete tasks, create tasks, it can uh query the ontology. And that's the power of building within the Palunteer platform with AIP agents and in agent studio is you can build your agents where your data is. And so the ontology is a first class actor in this system.

The agent studio is model agnostic. So you can pick your model and for this task I've created a detailed system prompt here where I say okay I'm going to give you a transcript and I want you to query the ontology. I want you to create tasks and projects look if there's any existing ones and update them if not um and I can do this all in this no code um no no code builder for my agent and then I have the ability to add first class ontology tools into this agent.

So I can query the objects with SQL I can add actions. So, Agent Studio, it allows you to rapidly prototype. It allows the humans in your enterprise that are closest to the domain knowledge to actually build the agents.

You don't need to be a developer in order to create agents. It has an ontology first tool set. But the other thing that I do want to emphasize and we'll talk more about this in the deep dive session we have later for agent studio but it allows you to take a um prototype work workflow and deploy it into production.

So an agent that maybe takes less than 34 lines of code actually will show some of the code later to build agents that you can use um for these thirdparty applications. Well, you can deploy these agents into production uh very easily because agent studio will manage the complexity. I like to call it the complexity iceberg of uh what's under the hood.

So, if you actually want to manage CI/CD pipelines, versioning, deployment, tracing, logging, um evaluations, all of that comes out of the box for agent studio. So, let's jump back over to this agent and let's see what it's been doing. So, it's created a bunch of tasks for us.

We can see that these tasks have um actually been edited in real time. So I'll look at uh Saras scheduled a meeting with the customer. Let me look at the transcript and actually see where that happened.

So we can see that it's actually updating here in real time. Okay, this is non renderable font. But [laughter] if I show it in in this screen, we can see okay, let's add a new action item.

I had a meeting with the customer success about the dashboard requires. So our project's updating uh project portal's updating as we get in new information on our tasks and the agents working. Okay.

And then we're creating reports on each file. So if we go back to um the slides and our diagram that we're building up here, we created an agent in Palunteer, but you're not um restricted to just using that agent within Palunteer. can get all the benefits from agent studio but using your agent in any thirdparty application or service and you can do this through our platform APIs and our OSDK integration.

So if we go back to the demo okay so this is an OSDK app. It's um I built an OSDK but you could just use any existing app in your enterprise. It doesn't need to be um built within Foundry.

But let me open this app up. Okay, so I've got my meeting reports. I've got the same actually UI, but it's much more native to maybe what I'm used to using as a project manager.

Maybe this is where I come every week. And so I would love to just be able to use that same agent that I that we built out before in this application. So I'm going to upload the next week's all hands.

And we can see it start to spin here. Uh we can see the handoff that it's doing its reasoning process and this is all powered through our platform APIs. You can create sessions um get the trace of a session continue the stream all documented publicly and we'll actually um be doing this and we'll walk through um building a third party application a react app with agent studio in our deep dive session.

So please join us there uh to learn more about how to do this. Um, but we can see the agent's spinning and it's starting to update our projects and tasks. Okay, cool.

Uh, if we go back to the diagram again. Okay, we built an agent in Palunteer. We allowed you to deploy it anywhere that you have an existing application or service, but we also know there are many agent frameworks out there today.

And we want you to bring the power of the ontology into any agent that you're building. And so I'm gonna pass it to Ron to talk about ontology MCP. >> Thank you, Natasha.

Hi everyone. With a show of hands, like who was here, not here in PaloAlto on DevCon 1? Great.

So happy to see you back. But on Devcon one, one of the things we introduced was the OSDK, which is basically the ability to take the ontology or the power of the ontology and connect it to any application that you're building, whether that's in Typescript, Python, Java, or we [snorts] even have people writing applications in Go. Um what we're now showing here on this screen is a very you know simple ontology with actions of this same project management application with the same objects and actions that the dev console is giving you.

And what we're introducing now is the MCP for the ontology. So with this when I'll uh enable this this developer console application would become an MCP server that would be available for any uh MCP client to consume. And if you don't know what's MCP is all about MCP is stands for model context protocol which is the industry standard for how agents would talk to any tool provider through um a standardized protocol.

So the second show of hands is like who's using office applications? Good. Much more people than the one that attended Devcon 1.

Wouldn't you want to take all the power of the ontology and and bring it into your office application? So let's see if that works here. What I did is I've used uh Microsoft Copilot Studio which is a low code um agent building uh application and I've created an agent called Palunteer PMO assistant and as you can see here I've created in the tool section an MCP connection to our ontology and that MCP connection in the ontology is going to list here the tools there these are the same same resources that we saw in our dev console application.

Every action becomes a tool. The objects are available. Everything is available in the MCB server.

If we now go into my word uh and I need to create a uh monthly project report uh on whatever I'm doing in my uh projects. So, let's uh use this co-pilot uh um co-pilot agent uh list ask it to list all of my projects. And now, if you're not going to get rate limited or just timed out, it's actually going to retrieve the information from the ontology and bring it here into my word environment.

And whatever I'm showing you here in the word environment could be done in your [snorts] Excel. If you want to get the numbers of your projects, it could be done in PowerPoint to generate your uh project presentation or what have you. And we're seeing the data coming back here.

And you know, with a click add to document, voila, I'm done. So, I've just integrated the data from my um into my application. And just to show you like a super crazy thing, I can even say delete my projects.

And it's actually going to delete the projects on mytology because this is not just a read interface. It's a read and write interface. And if you're giving the permissions to the users to do these operations, they will actually delete that uh it will actually delete the interface the sorry it will delete the the projects and if I'll now query them again I won't get anything uh anything back.

So let's go back uh here and see that uh we've now used this copilot studio integration and we're giving you uh detailed description on how to connect uh to this copilot uh framework but we're [snorts] also supporting any third-party um procode um environment or framework. this is entropic SDK, this is open AI SDK, this is Microsoft agent framework or what have you. And the integration is very simple because it's based on the industry standard, the MCP standard.

Uh, and what you can see here, we're taking the uh we're creating an OOTH client and getting the token and we're passing passing that token to the agent and the agent can uh connect to the ontology and do the operations. Last thing that I want to show you here is that we built this mini client that uh uh takes all of these three frameworks uh entropic with its own model uh Microsoft with GPT4 and OpenAI with the GPT4 mini. And we'll tell the agents to connect.

Uh now all of these agents are connecting through the MCP protocol to the ontology and we can tell it hey take the transcript that Natasha just showed us and run the demo and we will soon see that they're thinking. Uh [snorts] this one is starting to use the tools. This is these the other was two are still thinking and eventually they're going to come back with the same updates to the ontology.

They're now analyzing the the um transcript and um updating the ontology because this is integrated as I showed you before to Microsoft framework that could actually run as part of your team's meeting because it's integrated into uh into teams. Um last thing about uh security here uh basically the same principles that applies to any OCK application. You can use either a service user that have all the same permissions for all users or the end users permission.

Uh so you have the same controls over what the uh what the agent can do as you as you have that done with a standard OCK application and I'll hand it to you to some finishing notes. >> Great. Let's go back to the slides because Aron just deleted all my data so I can't demo anymore.

Um cool. Great. So we showed today that you can build agents everywhere both inside the Palunteer platform and outside in workshop applications or existing applications uh using agent studios agent loop or any thirdparty agent framework.

All these agents have one thing in common. They are backed by the ontology. It's your data, your actions and your logic that create that semantically meaningful layer for AI to operate on.

Um we have deep dive sessions and a canary workshop. So join us for both of those and you can learn more about building with OMCP or with agent studio. Thank you so much.

Your agents um should use the ontology and connect them to your organizations. Thank you. [applause]