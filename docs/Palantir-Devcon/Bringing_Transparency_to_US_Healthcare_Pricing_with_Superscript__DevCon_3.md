# Bringing Transparency to US Healthcare Pricing with Superscript | DevCon 3

[Music] Introducing from superscript co-founder and CEO Rahul Naidu. [Music] All right. Hello everyone.

We're going to have to move fast, so bear with me. What is Superscript? Superscript is a company built to do one thing.

return efficiency to the US healthcare market. How and why? Well, if you ask us, the category is broken for one reason, one reason alone.

It is the only consumerf facing category that doesn't function like one, which is to say the thing that's missing, the proactive consumer buying motion. And this structural breakage breaks the market in two ways that we point towards. One, the market can't allocate.

Consumers bankrupt themselves because they opt into the wrong combination of treatment X provider Xband um benefits configuration. That doesn't happen when people have prices. And two, the pricing mechanism itself becomes insane.

It's untethered from reality. And that's because consumer purchasing is the gravity in a consumer market that returns prices to truth. So to resolve that superscript spent three years in R&D thank you venture capital industry building a technology stack that we call healthcare first pricing protocol and what healthcare first pricing protocol does it's in the name it makes the first upfront prices in the category now when I say upfront price I mean a price that takes everything into account variance in the treatment that you're going to consume your exact cost share your spend against your deductible out of pocket max etc it's the last word you click the buy button and you're done there's no bill after the fact there's no shift in your estimate and we deploy that technology to practices today as kind of a Shopifyesque e-commerce stack.

Eventually we hit the Amazon but first we have to accumulate practices one by one as we build that network. The technology stack today kind of services two flows. The first is the proactive flow and you're seeing that behind me right now.

This is for the patient that knows exactly what they need. They wake up in the morning. They go to the doctor's website.

They enter their member ID. They see exact prices. They click the buy button.

They book. they pay and all of that information is written directly to the practices ehr shopping in healthcare. Finally, for the practices themselves, we deploy a front desk operating system.

You can think of it as almost a square kiosk in healthcare. It allows the practice administrator and you can see it here to build a priced cart of goods and then hit a save and send button. It's going to catch all of the required intake forms, etc., and then give the patient a text message that shows them the exact price that they're going to pay.

They can Apple Pay, Google Pay, credit card, etc. soon payment plan. They complete all their intake and then when they show up on the day of the appointment, they're done.

Nothing left to do. Real prices, real shopping in healthcare. So what do we build with Palunteer?

Well, once you build your pricing engine 2 and a half, three years later, you encounter a very, very interesting graph problem, which is assuming you've constructed your primitives correctly, you now have to traverse a graph of different rule set configurations, service type codes, benefit mappings, etc. And this is a hard problem because the surface changes all the time, literally under our feet. Pay and negotiated rates drift.

Benefit types change sometimes month over month, always year-over-year. And each time you deploy a new practice or a new segment of the market, you unpack an entire new series of rules that we didn't know about and frankly no one else in the industry knew about either. These things are variable at the practice level.

To quantify that problem a little bit, because we actually underwrite the prices we make, that's how they're real prices. We have a liquidity reserve requirement on our balance sheet. And with our current TPV and our current error rate, we have to hold $45,000 on the balance sheet just to deal with the inflows and outflows required for pricing.

With that same error rate, as we scale to a billion in TPB, which we expect to happen in about 2 years, that reserve requirement is going to scale to about $10 million, which is not exactly tenable. So the solution to this problem, well, with AIP, can we make the pricing engine itself self-learning? Can we set up a back propagation loop?

So it traverses this graph automatically without us having to go in and manually catch every single rule and updating our and update our system accordingly. And so that's exactly what we did. Behind me you're going to see the solution designer.

This kind of serves as a signpost for our entire build. It structures into four sections. Section one, can we determine on a per encounter basis?

Oh, I had to hit play. One, can we determine on a per encounter basis a set of descriptions for where our price is right or wrong? and then the rule set recommendations.

Two, can we then pass out across all of the recommendations which categories of recommendations are most valuable? Three, can we then build rule sets for those entire categories of recommendations? And then four, can we generate the implementation accordingly?

So what you're about to see as soon as this ends is our data pipeline. And really what's happening in the data pipeline is we pipe in live claims data directly from practices in the wild, real healthcare events happening, sits in an S3 bucket. And really what we do is we rip it out into two sets of ontologies.

The first set of ontologies are all of the ontologies that make up a single instance of a price prediction. The primitives from the superscript pricing engine. The second set of ontologies, and you'll see it behind me in a second, in the data lineage is the set of ontologies that make up a single instance of healthcare happening in the wild.

A real claim. What fields on the claim do we care about? The prediction and the encounter meet in the middle into a prediction and truth pair.

And then that is the piece that we hand to our first AIP logic function, the global summarizer. The global summarizer takes that prediction truth pair, does a couple of search arounds to find all of the possible associated claims, prediction entities, etc., and then ultimately hands that to an LLM, and the LLM has been prompted with detailed descriptions of how a pricing engine works and a detailed description of the exact kind of output we're looking for. And so what you're about to see on the next screen is the workshop where you can see some of these outputs.

On the left, you can see an index and each item on that index is a single encounter, a single healthcare claim that carries with it a prediction. And on the right, you can see our LLM output where it tells us, hey, you guys got the price right or wrong. And when you were building this price, here's what your engine did.

Here's what actually happened on the claim. And now here are 1 to 3 4 5 recommendations to update the pricing model so that you get this correct next time. The challenge here though is that this is thousands of recommendations.

And so the very next problem for us is okay how can we identify the right categories of recommendations that we need to take seriously. And so you can see here we group by payer we group by treatment. You can now immediately see okay we need to look at BCBS.

We take the intersection build a heat map and now the team can very quickly identify which categories we need to resolve. Enter our second AIP function the rule set generator. Once we've identified the category, this allows us to say, "Give us all of your rules for VCBS and take those thousands of recommendations and build that into a single rule set that effectively sums and reconciles." So instead of our team having to pass out thousands of rules, give us the 12 rules where if we implement these, we're now going to be correct for these BCBS claims across the market.

And then finally, we hooked up an external API that reads from our pricing engine codebase that generates a PR. So the rule set gets turned directly into code and then sits right there ready for our team to ingest. And the example behind me on the screen is is one I really like to talk about because this actually happened in the wild last week.

We have a deployment in Texas. We were making a mistake with epidural pricing. We found out the manual way.

The practice reached out to us and said, "Hey guys, this price is wrong." And so we resolved it the manual way. our insurance pricing lead, Brian sitting in the auditorium, looked into our logic, figured out what was wrong, resolved it, and then the very next day we're working on AIP and Brian goes, "No ways guys." AIP caught it first because it had sitting there ambiently in our build was the exact right rule set change at the code level, which had we implemented would have resolved that epidural pricing problem across the entire market of epidural treatments. And so to kind of recap what we've done here, healthcare first pricing protocol makes a prediction for a healthare price in the wild.

Then the healthcare event happens and generates truth, a claim that we pair with that prediction. We hand that pair to AIP. AIP describes the problem and articulates a solution at the claim level.

We then pass out across all of our solutions which ones are valuable, which categories are valuable. We build that into a rule set of solutions and then ultimately we generate the implementation so we can push the fix directly to our codebase. And so instead of us having to deal with that graph problem manually traverse it, our pricing engine now traverses it automatically.

And so to go back to that number, the liquidity reserve requirements, we forecasted out the accuracy we expect our system to accumulate running AIP over this time period. And it results in an 81% drop in our liquidity reserve requirements from 10 million down to two, which is super super exciting. And that's before even talking about the literal thousands of hours of engineering time that we are going to save in manually catching and updating these cases.

And so there you have it, ladies and gentlemen. Healthcare's first pricing protocol. Real prices in the market.

Now self-arning. Thanks to Baller. [Music]