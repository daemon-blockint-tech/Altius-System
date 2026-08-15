# Opening Remarks from Akshay Krishnaswamy | DevCon3

Please welcome to the stage from Palanteer Chief Architect Ashe Krishna Swami. [Applause] Good morning everyone and welcome to Devcon. We've got an action-packed couple of days planned full of product launches, plenty of different types of hands-on sessions, and of course, plenty of time to build.

We're thrilled to have everybody here with us today. And before we jump in to the product launches, we just wanted to start with a little bit of framing about what you're going to see. So, as many of you might know, since day one, Palunteer has been has taken a forward deployed approach to product development.

And it's been kind of amusing, a bit interesting to see forward deployed engineering become kind of a meme out there in the industry now and hearing people like venture capitalists start to tout it almost as a piece of like a fashion statement. Um, for us though, it remains a defining ethos. We work backwards from the most complex problems that our customers and our partners have and that defines what we need to build.

We almost think about it as a human form of back propagation where you're trying to continuously work backwards and figure out what's working, what isn't, and what to build. And above all else, it's a radical orientation around the outcome, which I'm sure many of you can relate to. Now, with generative AI and AIP, this means specifically enabling builders to deploy AI products in the most mission critical context in the world.

This is staff scheduling in hospital settings. These are underwriting workflows across different insurance companies. These are build operations across shipyards and of course all sorts of defense and intelligence missions across the spectrum.

In each of these cases, we're not talking about doing what's just minimally viable. We're talking about doing what's maximally ambitious. And really the vision now is working towards enterprise autonomy in many senses of the words for Palunteer.

This means when we think about building our platforms, we're thinking about the frontier of the ambition that you have and that all of our customers have. You know, we're thinking about enterprises where there will be thousands of agents deployed wielding thousands of specific tools across every workflow imaginable. Now, some of you might have been tuned into the discourse around AI in recent weeks about the nature of frontier models and about how they reason or maybe how they don't reason.

And I think it seems like with every passing day, we learn more uh as we go further down the rabbit hole of mechanistic interpretability and other research. But I think at the same time, some things are actually becoming clearer, such as the fact that these models can provide immense utility when properly leveraged. And we think that starts by having the right mental model for how to use them.

We think that they constitute their own distinct category of what we call as AI labor. You have traditional human effort and human thought. You have traditional computation and almost is like a conceptual bridge but its own distinct category.

You have AI. And what that means is in addition to all of the concerns and things you have to do when it comes to building products and services, you now almost in pursuit of building AI products have to engage in what is what is essentially a rigorous form of alchemy to figure out the balance between human AI and traditional computation. And it's an iterative inductive process where you're trying to figure out maybe in a first stage of a workflow you're inserting AI in one part, but then you need to be able to smoothly dial up and change the distribution among these categories over time.

And so as an example, if I'm working in a supply chain doing maybe inventory management and I'm dealing with supplier disruptions, I might have mostly human labor and traditional computation doing things throughout all steps of this workflow. And maybe just for the first step, we have AI assisting with triage. But then over time, as we learn what's working and what isn't, as we test and evaluate different conditions where AI can help, as we equip our agents with better tools and more context, we start to dial up the amount of AI that's happening across the entire state machine of the workflow.

And again, it's about this smooth ramp where you can actually infuse incrementally in all the critical processes you have. Now to get this level of composability comes down to having a shared world between humans and AI. And what we mean by that literally is there needs to be a shared sense of data, a shared data foundation which encompasses all modalities of data.

There needs to be shared access to logic tools that can be wielded. All forms of business logic, optimizers, all those forms of traditional compute that we think about. There has to be a shared framework for being able to take action.

uh including with all the governance guardrails that we expect. And of course there has to be a common security and governance framework at large which goes beyond just simple role-based access controls and includes more active controls like purpose-based controls, markings, um all those guard rails and of course auditing capabilities that can span both human and AI teams. Now the ontology is this shared world for human AI teams.

And it sits as part of a broader architecture because if we think about everything it takes to power to build to wield these uh these these foundations that you're going to deploy your critical workflows at top it requires everything from multimmodal data integration to change management to a full spectrum tool factory to all the security and governance features application building all the APIs and SDKs. Um, it really constitutes kind of a whole category in and of itself. And this is the goal of what we're trying to do with Foundry and AIP powered by Apollo.

And you know, if you think about all the requirements that go into this, what it takes to go from these raw inputs and commodities to the outcomes, it actually starts to add up. It kind of runs off the page here. Um, you know, just sort of my simple graphic.

But we think our conviction here at Palanteer is that really it constitutes a new category in the AI stack. So if we think about kind of a simple rendition of this from energy on up, of course there's raw energy. You then have chips, you have data centers, you have the frontier models that are increasingly commoditized and available but increasingly powerful as well.

And then there's everything you need to get from that to differentiated outcomes, products and services. And we are maniacally focused on providing this AI infrastructure for developer teams, for enterprises, for everybody looking to achieve value with AI. And this is what we think you need to build and deliver full spectrum AI products in the cloud, at the edge, for your customers, and throughout your enterprises.

So today, what you're going to see is a whole bunch of investments across every part of this AI infrastructure stack. new ways of building automations, new ways of being able to manage your ontology, new additions to the SDK, new ways of being able to deal with new new forms of data, um new ways of being able to manage all the workflows you're building, and even an AI forward deployed engineer that helps you build and orchestrate across all of these things together. So, I think it's going to be an awesome couple of days.

Again, we're super excited to have you all with us here today. And to kick things off, I want to hand it over to Jeg and Anuk. I told him,