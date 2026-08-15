# Palantir for Builders | Analyzing Timeseries Data in Quiver with Goodnight Midstream

[Music] Hi there. I'm Michael Bryan. I'm the director of data science for Goodn Night Midstream.

Uh Good Night Midstream is a uh Midstream oil and gas company. We focus around produced water. Uh we have a network of about 700 miles of pipeline uh that moves water from oil production pads to uh disposal facilities.

And here I'm going to go through uh some of the really cool stuff that we are doing in Palunteer Foundry. So um you know one of the key parts of us going with Foundry was analyzing time series data. And so the dashboard here that we have pulled up is a look at uh pressure sensor data coming off of our pipeline systems.

And we're integrating that with um flow data so that we can figure out hey are is there a high pressure differential between two locations on the pipeline and does that indicate if there is a blockage or some sort of scale buildup inside that pipe that we need to go take action against. So what we've built to date is uh here below uh the end user will go and select the uh pipeline system of concern. um they have the ability to then go and select um the pressure sensors that they want to uh calculate the differential pressure between.

And so um this map on the right kind of shows those locations. It's the little target so the user knows hey these are the locations I've selected and how does that correspond with like a GIS view. Um and so these time series charts below are of um the flow rate that is going through the pipe and the differential pressure between the two selected locations above.

Um and so what's really awesome about uh Quiver and and the the analysis tools is that you have the ability to look at time series data and then um search for only things that you want to compare against. So like apples to apples. So you're able to filter out data that you do not want to see.

So we have different modes of the pipeline and that is represented by this um this red um line chart here. And so we want to filter out those data points that are associated with the red um and to leave us with um flow rates and pressure time periods that we want to analyze. So um those you'll see see the gaps that corresponds with the um red above.

So that filters out the data. the end user is able to go in and say, "Okay, I I want to select time ranges from the data set above that um I want to compare." So, the user makes those um comparisons and you're able to see a distribution of how the um the number of data points that are uh associated with the differential pressure and what buckets do they fall in. And so you'll just notice here really quickly that the first time range against the second time range we have this green pressure band and that has moved out to the right hand side which indicates the pressure has increased between those two locations.

So you can spot that in a in in a very quick amount of time. Um and then you then have the ability to have like insanely granular level detail to kind of display the data above but say okay we have these certain flow rate buckets that the pipeline is seeing. So you have you know um 100 thou 100,000 to 110,000 barrels a day moving through that pipe.

How does that impact the differential pressure? So you can see um these different groupings here and you can actually visualize the data points that are included in those groups and then you can say okay I have a uh a bucket range that has 33,000 data points against range one and 36,000 data points against range two. That is a you know statistically relevant comparison.

And then you can go and look and say, "All right, hey, the pressure that we selected for the first time range was 100 PSI and now it's 127 PSI." So, we have seen a, you know, 25 PSI increase between those two areas. If that's relevant for our petroleum engineers, they will then dispatch a work order, say, "Hey, we need to pig this section of the pipe." And they're able to do that insanely fast. Um, so Quiver makes that um insanely powerful to be able to produce and very quickly and we can get this right out to the end user.

Um the next dashboard that I'm going to walk through is really like higher level and it's around um our volume analysis. So we have 700 or so um transfer of custody locations where they connect to our pipeline. So that's a lot to manage.

Um we are rolling out analytics that it's focused to the end operator. So the guys that are in the field that are responsible for the assets, they are able to interact with a volume dashboard that shows hey here are the locations that had the largest uh volume drop dayto day and then they are able to find that quickly. Um so this chart here shows the um the areas that have the largest uh volume drops and the areas that have the largest volume increases.

And then the uh table below shows the most granular detail where um it shows you the exact location that has the largest day-over-day drop or the day-over-day increase. And what's powerful about this is the end user can go and create a log item that will then move all the way from the field user all the way up to sea level. So if there is a rigon location doing work on one of the um uh transfer custody points, they put that information in that rigon location note will move all the way up.

So it eliminates questions from our sea level team saying, "Hey, why are we seeing a volume drop?" They just then go into their volume reporting view and that uh log item propagates through all the way to them. So eliminate those like dayto stopping questions where it's like you get an email from the CEO, you need to go find the answer. that stuff has been eliminated with um uh the ability to have these comments link from the data entry side all the way up to the higher level reporting for VP of operations and sea level folks.

So that is it for uh the demo today. Um as for what the future holds for goodn night and palunteer the amount of things that we have to build in the platform is endless. So we have a lot of work to do but we're very excited about it.

Um, Foundry is a very inspiring tool to use. [Music]