# Startup Fellowship: Usul | DevCon 4

Introducing from Usul, CEO Jiren Reed and founding engineer Parm [music] Meta. >> Check. Check.

Hey guys, my name is Jiren. I'm one of the co-founders and CEO here at Usul. Usl is an AI company that helps other companies sell to the government.

And our goal is to completely redefine how companies and governments interact around the world. Today on stage with me is Parm, one of our founding engineers. And together we'll tell you oh together we'll tell you a little bit about who we are, what we do here at Usul, what we built on Foundry over the last month, and how it significantly impacted our commercial and government customers.

But before we get into any of that, I'll tell you a little bit about us. Um, like I said, my name is Jiren. Um, you're probably wondering how old I am.

I'm only 21 years old. Today's actually my birthday, funny enough. Um, thank you.

Um, I actually I grew up in Washington DC and worked for a defense company since I was 15 years old. dropped out of high school for the first company I started. Went to Stanford, worked at Palanteer as an intern actually when I was at Stanford and then dropped down after sophomore year to start us.

And I'm one of the few people in the company who's actually completed college uh in computer science and I used to work at a fintech company and I got convinced by here at Usul to revitalize selling to the government. Cool. And together, Parm and I realize that the US government spends over a trillion dollars annually across siloed databases that don't speak to each other, which makes it very difficult for companies to sell to the government and for the government to track its own spending.

For example, I was just running around the Pentagon with my computer with the CTO of the Navy. And come to find out, the Navy has no column in their database for which office controls which congressional budget item. So to figure out simple answers like who's our largest supplier of drones to the Navy is very difficult.

So we started us. We make it very easy for companies to find and win lucrative government contracts and for the government to track their own spending. We graduated Y Combinator a year ago and have since grown to 10 people in the heart of San Francisco.

This is our office. It looks pretty crammed. I think we need a new one.

Um and we're now serving some of the largest and fastest growing defense companies as customers and the US government itself. So traditionally auditing the entire US government has been near impossible. So we built market maps where in one click any company can instantly find every government transaction for the product they build from anything like small aerospace components like ball bearings to large unmanned autonomous systems to consulting services and it's all possible with Foundry.

So here's the architecture of how we built market maps on Foundry and we did this through two main workflows. The first workflow is combine aggregate all of this USA spending data which is as Jiren was mentioning extremely archaic and extremely large and we took that data and we pumped it into Foundry and where we did multiple transformations ran LM agents over that and pretty much put it in a bunch of categories and these categories can range from like drones to like services, roads and bridges and eventually our output was a tagged truth data set where we had a map of every single dollar that the United States government spend event to specific categories. Now, our second workflow that we ran was more on our customer side.

The way that works is one of our customers would put their product specification or their technical specifications and that will trigger our Palunteer workflow. From there, we'll map out every single category of spend that that specific product could be applicable to. And then we take our tag data set, our s our truth data set and through our market intelligence layer, we map out every single line of funding that that specific product can particularly be applied to and then we export that back into our application where we can see a nice little graph.

Now Foundry was really important for two main reasons. The first reason is there was sort of visibility in this large data set into the categories that we were creating and that was extremely hard with doing it outside like through outside infrastructure and secondary is this whole endto-end pipeline from our customers inputting our data to the final output building infrastructure that optimized on accuracy speed and cost would have taken almost four times the amount of time than it did on Foundry. Cool.

Uh can we jump in the demo? Cool. Leo.

Okay. Hey, this is our live product. This is Usul.

This is Market Maps. Uh, like we mentioned, in one click, any defense company or technology company can identify every government transaction for their product. So, all the company needs to do select one of their business units across the company that they have.

We'll choose autonomous air systems for this example. They'll then select any of the products they build. We'll choose drones for this example because I'm sure everyone here is familiar with what a drone is.

Um, and once a company inputs all the information about their product, our Palanteer workflow is triggered to automatically identify every government transaction for this company's drones. This is a finished market map here. You can see this fancy graph depicts all of that spending.

And we can break this down however the company likes. If you click on uh subcategories here, we can break this down to let's say command and control systems. Let's also do unmanned underwater vehicles like submarines like that.

And unmanned ground vehicles on land. If we click out of there, you can see our applied changes have identified specific capability areas for this company's drone. So they can find specific use cases for their technology across the government.

And lastly, if you click on the configuration panel there, let's scroll down to the bottom. We can see that Palanteer automatically identified each category of spend on this graph on the bottom. Anything from like air aircraft and aerospace components to large weapons um and ammunition warheads to C5 ISR intelligence products.

And it's all been made possible in Foundry. Go back to the slides, please. Thank you.

Uh, over the past month, we rolled out market maps to over 60 of our customers, analyzed over 20 billion of their own government contracts, found over a hundred new government contract opportunities, which in aggregate created over $400 million in contract pipeline for our users today. I know these might just look like big numbers on the screen to you, but I'd like to emphasize that market maps has unlocked a whole new part of the market for us. primarily large Fortune 500 technology companies and defense primes who have a large array of products that they can sell to the government.

Now, over the next month, we want to continue rolling out market maps to the rest of our commercial and government users. And over the next year, I'm going to continue working with Palunteer to roll it out to the rest of the US government. I'd like to end this by saying thank you guys so much for having us here.

This has been incredibly fun. Like I mentioned, a year ago, I was an intern in Palunteer's DC office and now I'm up here talking to you today. Um, so if any of you guys are selling to the government or interested in doing so, we'd love to chat.

Thanks. >> [music]