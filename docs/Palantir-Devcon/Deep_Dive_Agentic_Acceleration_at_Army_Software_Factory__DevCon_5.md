# Deep Dive: Agentic Acceleration at Army Software Factory | DevCon 5

Good afternoon. I am Lieutenant Colonel Mark Askew and I'm joined here with my colleague, Mr. Alan Monahan.

We are very proud to be here to talk to you about some of the work that the Army software has been doing in modernizing the Army's business practices through agentic automation and using a lot of the tools and capabilities that you all have been learning about today. What we're going to talk to you about is a real Army problem that was submitted to us that was worked on by one of our software development teams and pushed into deployment. First, I'd like to give you a brief introduction of what the Army software factory is.

The Army software factory was stood up about 5 years ago as a pilot program to test out the capabilities of soldiers performing software operations. Software operations is delivering results through software delivery to solve real Army problems. This program has been incredibly successful within the Army.

We've shown that active duty soldiers can come in, identify problems, scope them, develop and deliver real solutions. We work across a variety of different tech stacks to include some of the technologies you're going to see today to provide real mission value to the Army. What we try to do is at the Army software factory is is provide two things.

We provide people trained in software operations and outcomes. The people that we produce are trained in product management, design, software development, and platform engineering. Those people work at the software factory to solve problems and then go out into the force to go to various echelons and solve real-world mission problems at scale.

The second thing I would like to talk about is the outcomes. You see some metrics behind me that outline some of the value that we have contributed to the army. What we try to do is actually identify the right problem and identify how a software solution can be implemented to solve that problem and bring real mission value.

We do this at the operational, the tactical, and the strategic level. Uh a lot of the applications that you would think about with army software are, you know, probably more tactically oriented. What we're going to talk about today is some of the enterprise level problems that we've identified.

Specifically one with implementing digital transformation, modernization of legacy systems. The army is a large enterprise. We have a lot of legacy processes, systems, IT applications that need to be modernized, need to be streamlined.

Our software teams go out and tackle these problems and really deliver the value that our stakeholders need. So, with this, I'm going to hand it over to Mr. Monahan, who is going to go through a live demo of what we've done with this problem.

Thank you. So, as Mark said, our software teams develop software solutions for real army problems. One of our teams is currently working on modernizing a process involving taking personnel, identifying uh training locations, identifying training paths, as well as optimizing uh the uh training cycles, the throughput for training organizations, and distribution of training so that long-term, we can fulfill the needs of personnel for the army.

So, the software team developed a software solution that involves what is currently being done, which is this same process, but with legacy code uh written in SAS, rather complicated forecasting model to help with that forecasting. SAS is a statistical analysis language and it's run on on-premise servers in another organization with a lot of manual overhead, a lot of manual work to actually run these forecast models, do those projections, and then adjust training down the road. So, our software team as part of developing this solution was going to modernize that forecasting process.

And they were able to do that. So, a team of engineers, product management, and platform support using AIFDE as well as some of the other AI coding tools within Foundry uh started small with the single file SAS. Uh they were able to successfully convert it to a Foundry transform.

With that success, started to build up uh over the course of days larger and larger components of this forecasting model. Uh Additionally, they were able to build out a knowledge base in markdown so that future iterations of the AI agents can learn from what they've operated on in the past. With the end goal after about 2 weeks was this entire forecasting model had been transformed into Foundry transforms and installed on our platform uh with some testing and validation ongoing as well.

We've also taken the knowledge that we've learned, uh that knowledge base of markdown documents and all of our lessons, transmitted that to the receiving organization so they can access and use these tools against other legacy codebases as well as continue to modernize and transform uh this current forecasting model. And then we can hook up our software solutions to that. What we're doing now is looking to automate and build out Agentic workflows to do a lot of automation that gets you from uh get you basically 90% of the way there very quickly.

So, we can get to the last mile where the hard work and expertise is done. I'd like to show you that now. So, to start we are talking about uh taking SAS code, transforming it into a set of foundry transforms that you can run on a modern cloud architecture.

We're going to go through five stages. One is decomposing those files, decomposing that code base into core components that we can then use later down the line. Step two is once we've decomposed that, we look across the entire code base as well as individual files to identify different warnings, identify critical issues that need to be addressed prior to actually doing transforms.

After we've identified those issues and triaged them, we can go into reconnaissance, which is a detailed exploration of each of the files as well as the code base and the processes around that. All this information is used to go into two stages for the translation. One is decoding into pseudo code and then taking that pseudo code and then encoding it into our target language.

So, we do that for two reasons. One, that pseudo code is like a universal translation layer. So, for instance, if I want to transmit SAS and transform it into R, I just swap out the encoder for an R specific encoder.

Now, I don't have to worry about the rest of the pipeline. Everything up to that pseudo code point is still valid and then we can, you know, adjust encoding to different languages at rapid space. So, now we've gone through this, we'll go through each step in a little more detail.

Let's start with decoding. So, a little about SAS if you don't know it, I will pull up a little bit of SAS code here. This is all generated, so notional data.

But, SAS is a procedural language. So, it involves data steps where you process data, what's called proc steps or procedures where you do specific procedures, and then macros, which is like building code at runtime based on variables. And you'll see some examples of this.

This proc SQL is actually how you run SQL in a SAS environment. You say proc SQL, you run SQL statement. Down here you'll see proc means, which is actually taking, in this case, the number of records, number missing records, minimum and maximum of these columns, right?

So, you run a procedure, returns results, and then you move on, right? Very listed out, and then files pass data to each other as well as variables and macros. So, our first step is to decompose this.

Not just take code file, but decompose it to core components that we can use down the line as well as log that information for future use. So, in this case, in the middle is our code manifest, which is our entire code base. We have six SAS files around it that make up this code base.

And then each SAS file is decomposed into the procedures it uses, the data sets it references, the data steps it uses, as well as macros, system functions, file inputs, and other information. So, out of one SAS file, we get nine different ontology objects of the core components of that file. This is actually done just through regular expressions, all right?

We have a pipeline that takes a SAS file, takes the text of it and parses it out to all these different components, and saves it to the ontology. That way we can build up a, you know, a knowledge base of procedures that are used and enrich that information to use it for future processes. In this this case, we have 54 different procedures identified, but only 12 unique ones, and we can catalog that.

So, after we've decomposed all the files, move on to the warning system. We take across the code base as well as each file and identify obvious warnings. They're hard stops, which means this translation or transform will not work without addressing, or soft flags, which is issues that we identify that may need to be addressed down the line, but aren't going to stop this process.

This is our first human in the loop interaction where we take a subject matter expert, address these hard stop warnings, provide additional context, and a way forward for the agents to use down the line. This case, this is a essentially a warning agent, which is takes all those core components as well as the SAS file itself, and does some triaging down. so we load up all the objects and all the data from that and then we start running several logic functions.

One to do dynamic warnings, one for circular dependencies, file references if there's a local file that's referenced that we don't have, right? That would be a hard stop and we need to identify where that file is. So the outcome of this is a set of warning objects that need to be addressed by subject matter experts or people who understand this code base.

You can see for this perspective like this in this case this is the first time I've run this. Proc GLM is a generalized linear model. And the agent really doesn't hasn't seen that before and has no reference to what that is.

We have SAS documentation we can add to understand that or subject matter expert can come in here add notes to that to to describe what that is. So agents down the line will know that that's a linear model, how that operates and that sort of information. And we build up that corpus of knowledge so future iterations will know what a Proc GLM is, a Proc Reg which is just another linear regression and so on and so forth.

We also identify maybe conditional statements that we need to tweak and that sort of thing. Once you've addressed the warnings, we go back and our Recon agent goes file by file and makes a comprehensive analysis of each file in human readable form. So this is the major the next major point where we bring in subject matter expertise in the code base to evaluate all the same information coming in a human readable form.

We can add information to it and then approve this prior to our translation workflows. This case we get a summary of the file, what it's doing. We get a logical flow for each of the stages.

I picked one file to follow all this through. This is our statistical forecast file that develops the forecasting builds it out. So it breaks it down into stages identifying what the inputs and outputs are, key operations, Uh, workflow and logical flow of this file in a human-readable form referencing data sets, referencing procedures, referencing variables that input and output for us to evaluate in in detail.

We have decision points, validation flags, uh, iterative steps, and data that's necessary. We also evaluate all the inputs. So, what external data sets are read in?

What temporary data sets are made? Upstream data sets, macro variables, everything that inputs into this and where it comes from as well across the code base. We look at the outputs.

So, all the data sets that this file writes and where that's used down the line as well as temporary and downstream usage. Uh, global variables and the same. So, comprehensive analysis of the inputs, the outputs.

We also look, since this is SAS, we do SAS specific inventories of those procedures I was talking about, as well as macro analysis. And finally, we summarize the risks. So, these are the risks that we saw before.

With some human invention, this regression that the agent uh, did not know about, uh, we added some information and now it's recommending uh, a Python library called statsmodels that you can do linear regression on. So, using some of the information we add, and this is added to the corpus of knowledge as well. So, future iterations will understand that this Python library is probably referenceable to this regression and does the same kind of work.

Then we have triage by high risks, medium risks, and low risks. This gives you your comprehensive report on each file within that code base as well as across the whole code base uh, what you're looking at. So, after this approval, uh, after we approve all of these reports, then the automation kicks off to do two things.

One, we're going to decode, and then we're going to encode into our target language. So, we move on to the decode agent. So, the decode agent takes all of those recon reports.

We can see some of the information that it pulls. We take the SAS file, we take all the warnings from the manifest, we take the recon report from that file, as well as some ancillary documentation that we've ingested and made searchable to evaluate and build up a kind of comprehensive dossier to pass into the pseudo code agent. So, this is going to take all of this information.

File dependencies, warnings, confirmed inputs and outputs, and then develop a pseudo code along a lot of translation rules and staging ordinances. So, the goal is not to just take a file and say straight pseudo code. You'll see this is also going to break it down into execution stages.

So, not just the logical flow, but what kind of the parts of the file can be grouped together in execution stages that we can then triage later. So, in this case, you know, we get an agent confidence score, how confident it is in the translation of this document. Uh, this recommended six identified six execution stages within this one file, and you can see them here as a summary.

So, we have historical data preparation, we have model building infrastructure, and then we have the actual statistical modeling, uh, as well as some other information regarding uh, encoding notes. So, some of the procedures being used, some of the warnings we identified earlier, all comprised in this uh, what we call pseudo code document, which details these stages. This is actually written out more for agents as opposed to human readable.

So, this is all JSON we're passing on down the line cuz JSON is works well with agents. Um, if you want to see the full, like raw pseudo code, in this case, stage one has this logic, which is really pseudo code logic, step wise, what's going on and what's being referenced. Stage two is also relatively short.

And you'll see stage three is quite long and complex, right? So, within those stages we can identify a complexity of how much work needs to be done as a execution stages. So, we developed our decoding and our pseudo code documents, it's time to move to the encoding pipeline, which takes this information and runs through the encoding.

This is actually a several step process in an orchestrated manner. So, we start with the same pseudo code document that we were talking about. That gets passed to an assessment agent.

So, the assessment's agent job is to look at the complexity and the number of stages and how detailed those stages are and identify if it's going to be a single agent or an orchestrated framework to do these translations. And if it is orchestrated, uh what stages can be grouped together for a single agent to process so that it keeps the context as well as we can speed up the encoding within this. And it gives it we give it a framework across four different criteria regarding how complex it is and assign it a complexity score and that determines if it's orchestrated and how many agents.

Going back to that concept of scoping agents down to limited context and limited work with that. So, in this case we have four different dimensions. What's the number of outputs?

How much of the risk we identified earlier is concentrated in this file and in these stages, right? As well as uh interdependencies and our general confidence, right? If we have a low confidence then we're going to assign more agents to triage that and work on it.

After the assessment agent assessment agent generates an encoding session, which is saved in the ontology. So, it just recommended an orchestrated framework and it recommends three agents across those six stages we identified earlier. And we also get a complexity assessment of why it made that decision and what the major signals were so we can evaluate that later as well.

And you'll see here each of these uh translation agents is going to get various stages. This first one is going to get stages one and two, which we identified were a little shorter. Stage three is going to be translated by itself by an agent.

That was a long complex forecasting model is actually built out in that pseudo code. And then four, five, and six are going to take a third agent. So it's going to be done in parallel but referencable once we run the final boundary transforms.

That gets passed to an orchestrator agent, which still develops what's called a transform contract for each of these stages here. So a transform contract tells the pseudo code what stages and tells the agent what pseudo code stages it's going to do. We're going to pull all of that information in.

We're going to pull in all the information from the reconnaissance report for that file as well as the warnings associated with that file. We're going to pull in the lines of code from the SAS file that the pseudo code identified with those stages. So we're not using all the file, we're just using the context that's relevant to that agent.

And then finally, we're going to develop what you see here, which is a transform contract. So this is all the detailed information we had before and instructions to spell out this translation sub agent how it's going to translate the file and the information it has. So in this case, this once this transform contract is made, it triggers your sub agent for each of these and we're going to go through several calls, one to filter information, one to validate the lines of code that we pulled in versus what's referenced in the pseudo code document and then you know, all this information compiled together for the transform agent to actually pull the transform.

We're also pointing foundry documentation that it can reference to understand how to write a transform, what that needs, and that sort of thing. And then the final output after we operate all this is each of these sub agents writes out a single foundry transform. So one SAS file has three individual Foundry transforms with the imports and a key key indicator here and key option that we do is wherever we write Python, we include as comments the SAS file lines that are relevant to that Python code.

So, within the code itself, we can take subject matter expertise, we can take Foundry experts identify this SAS file is supposed to run this. This is the Python that executes that same logic, right? So, throughout the code we can validate in our original file what's happening, in our transform what's happening, keep that all within the file structure itself.

Finally, to reference to make it simple, we reference one SAS file to one Foundry transform in the end. We have a compilation agent which takes these transforms, compiles them together into one file in operational order, deduplicates the imports and does does validation across to do validation of the code within these transforms as well as validation of the Python imports. And then this gets you to a set of transform files that should be relevant against the SAS files and that gets you to the last mile, right?

Where the hard work begins and the expertise really helps hooking those up to data sets, validating the outputs. And we're currently working towards building out validation and and reference frameworks so that we can start to evaluate inputs and outputs of a file that we have versus inputs and outputs of a transform and any incongruencies where you're going to have agents start to validate and propose adjustments until those outputs are identical to each other. So, through this whole process, taking six files takes about an hour or so to process through all of this with some human intervention.

Like I said, that gets you most of the way there and then you can really spend your effort on that last mile to really hook everything up and validate. So, what we've learned through this is a couple of best practices I'd like to share. One is ontology as a data layer.

Use the ontology to house, store, and warehouse all of your knowledge from prior work as well as passing information on. Um separation of concerns, right? So, one agent, scope it down to specific sets of work so that we can focus and not have provide too much context, which takes us to three.

Curate the context you're passing so that we don't overload agents with too much information and they start to get confused. Um we're building out adversarial review like it's talked about in Hivemind, where once we develop a transform, we'll have a different agent evaluate that transform, critique it for uh against documentation, for issues that might come up, and then propose solutions. And finally, human you can't take the human out of the loop.

We certainly have several validation checks um because these are important systems that you're important codebases to modernize, right? So, we're trying to speed along modernization of legacy work into modern cloud architecture, lining our software teams to speed uh to solutions for the Army. So.

Back to you, Mark. Any closing comments? Thanks, Alan.

No, that was great. Um yeah, a couple of closing comments. I I think this use case is is a great uh example of the power of uh the platform and what you can do with it.

I I was really excited that the uh Hivemind demo happened earlier today. I think there's a lot of uh similar uh kind of logic that goes behind the construction of uh automated uh processes both with this project and with Hivemind. You're using a lot of the same functionality within Foundry.

You're using AIP logics. You're using automations. AIFDE helps sync everything up.

That's how uh Alan was able to kind of build this and pull this all And [snorts] at the end, you have a automated workflow that is reusable, that is language agnostic, that uses the ontology to continue to build your uh your your you know, breadth of knowledge across all these workflows and take this one black box, which is what we started out with this problem, and be able to translate that to other legacy processes. We can take this, we can import a new code base, and then using the same lessons learned, the same ontology sets that we've built for this, you know, give more uh audibility, traceability, and validity to the output in a modernized format to start to use Foundry to do what they were previously doing on prem in legacy systems. Uh but this was all done with the tools that's available that we're going over uh through this uh you know, through this event here, and that uh you know, the builders, you guys will have access to.

Really, it's it's identifying the problem, you know, decomposing it, getting a list of the tools and capabilities, and figuring out what your automation, what your orchestration of agents works uh will work, how it will work, excuse me, uh and then implementing that. Testing, validating, iterating, and then eventually you get to a point where you're able to take this process, package it, and use it for really anything. Uh any problem that you see that could use these agents, uh it's not just for code transformation.

You can do anything where you want to take some inputs, generate objects, generate a code base of knowledge, and then get that output. So, I think this is a great example of that. Uh I think uh you know, we will continue to use uh this sort of framework in future problem sets.

Uh you know, the Army always has problems uh that need to be solved, and we're looking to continue to, you know, use the platform, use our expertise uh to solve them, and help uh improve the Army every day. So, that's uh all we've got. Thank you very much.