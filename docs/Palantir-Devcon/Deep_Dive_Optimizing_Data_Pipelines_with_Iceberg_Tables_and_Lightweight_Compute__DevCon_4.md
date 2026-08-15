# Deep Dive: Optimizing Data Pipelines with Iceberg Tables and Lightweight Compute | DevCon 4

[Music] Please welcome from Palunteer Ted Chester Jensen and Matthew Bayer. [Music] Thank you everyone for joining us. Um we're going to talk to you a bit today about how you can optimize data pipelines in Foundry with some of the newer features that we've been working on.

Specifically, we're going to take a look at iceberg tables and lightweight transforms. Before we get into that, I'm Ted. I'm a group engineering lead in our data plane group in Foundry.

>> And I'm Matthew, a developer on our compute engines team. >> So, we can break our data platform down into three main columns of features. At the center, we have our orchestration and governance features.

These are things which historically Foundry has been incredibly strong at. So you'll be familiar with a lot of the sort of scheduling functionality that we have the data lineage through which you can uh view your enterprise pipelines and of course we take security very very seriously. In addition to these features we have storage and compute and a lot of the work that we've been doing recently has focused around making these as flexible modern and modular as possible.

So on top of the things which a lot of you will have experience with using our core data set stream and media set primitives as well as our compute with flink and spark we've opened up new modalities in both of these spaces to make things more flexible. The first thing I want to touch on is iceberg tables. The big headline news here is that we're migrating native foundry data sets to use iceberg.

This is a feature that's currently in beta. We have it testing on a few stacks right now. And so to get going, let's talk a bit about what iceberg actually is.

So Apache iceberg is an open-source project. And at its core, it defines a table specification. A table specification is a metadata layer that lives just above your data file format.

So in your data file format which is typically paret you have your tabular data stored. We care about a lot of information in addition to that. Things like schema branches and transactions all fall into what we call table specification.

Traditionally these things have been managed with a proprietary system in foundry. The innovation of iceberg is to do it in a standardized and open way. This makes your data completely portable and interoperable between different platforms and comput engines.

In addition to this table spec and really critical to the success of iceberg is the catalog specification that's also specified within the framework. A catalog is a server that can serve information about your tables, crucially where they're located. And in Iceberg, there's simply a REST API that you can implement.

And as long as you're compliant with this, then all of the iceberg clients will be able to read your data. For us, this is a place where we can plug in all of our proprietary concepts. So things like foundry governance, things like foundry metadata, and of course, all of the sort of version control is managed in this layer.

The final thing that we get from iceberg is the clients. So, Iceberg provides a bunch of open- source clients in different languages and compute engines which can be used to easily read your data. Uh, some of the ones you may have heard of a PI iceberg which allows you to read iceberg tables from Python as well as the connectors that exist for engines such as Spark and Duct DB.

So, that's an overview of what iceberg actually is. I suppose the next question is why should you care? Well, we get a few key benefits from introducing iceberg in Foundry.

First and foremost, there are huge performance upsides. Early benchmarking showed around a 30% performance improvement on the industry standard TPCDS benchmark thanks to the advanced partitioning schemes that iceberg uses as well as its metadata management. In addition, it unlocks features which previously did not exist in the platform.

Namely, it unlocks in place row-wise edits and deletions while maintaining downstream incrementality. This is something that wasn't previously possible due to the way that metadata was stored in foundry tables and it meant that in order to perform these kind of workflows which are typical in things like CDC, you had to renapshot your entire data set. Another feature that's unlocked with iceberg is table compaction.

So this is the rewriting of many small data files into fewer larger files. It's an optimization that improves the performance of downstream reads as it reduces the IO overhead incurred in reading the data set. Finally, and as I already alluded to on the last slide, it gives us great interoperability.

This is true both for external reads, so if you're reading from another platform or maybe in a local session, but it's also true within the platform. It makes it much much easier for us to pick up the latest and greatest tech when it comes to different compute engines or different frameworks as connectors exist in the open source community uh and don't have to be built from scratch every time. We've done a bunch of work to make our implementation of iceberg best-in-class.

So the central column that you see on the on the slide here refers to some of those features that we're particularly proud of. Our branching implementation goes above and beyond what exists in the open source community and essentially gives you the full feature set that you'll be used to with Foundry data sets today. This is a very mature and gitlike version control system.

We've implemented schema evolution that allows incremental transforms to change the shape of data over time without having to replace or renapshot your data set. We've expanded the concept of transaction transactionality that exists in iceberg uh and made it more robust reducing the amount of conflicts you get from um parallel writes on the same data set which ultimately saves compute as our testing showed that these conflicts meant you got a lot of failed jobs and a lot of rerun compute. And finally, we've worked with the open source community to get double encryption included in the spec.

implementation for this is still being built out in the open source. Uh but the headline is that on top of the encryption which you get from your cloud provider, keys can be stored locally and uh an encrypted client side reducing the single point of failure in the case that a cloud provider gets compromised. On top of these table features, all of the existing data platform features that you'll be used to in Foundry will continue to work on iceberg data sets.

So things like code provenence being able to jump into the code repo that your data set came from, data lineage, being able to view your full enterprise pipelining, version level security, and then maintenance tasks like retention will continue to work. So based on that last slide, I'm sure all of you are desperate to get your hands on this and we'll be eager to find out how that's possible. Uh, as I said, we're in beta and the answer is to come and chat with me.

I'll be here for the next two days. Um, I can give you my email. There's some eligibility requirements at this point, but we can we can have that discussion.

I'd be particularly interested in hearing from you if you fall into one of the following four categories. So if you've got really largecale data where you're hitting performance issues, if you have data sets that have lots of small files and that's causing downstream reads to be expensive, if you have use cases that would benefit from rowle edits or deletions, or if you have use cases that would benefit from interoperability. So maybe you want to read data externally in another platform or locally, then please reach out.

So that's the sales pitch over. I want to show you now what we were able to achieve in production by deploying iceberg in foundry. In this particular case, we had a single data set that was over a pabyte in size.

So pretty big. It was made up of millions of files and it was continually growing. This was an ingest of data from an external source and it was building every few minutes or so.

The result is that the file size optimization was very very poor. There were loads of small files and downstream reads were incredibly expensive. In addition, there were cases where in place rowle edits or deletions were needed due to erroneous data, but this simply wasn't possible.

The only way to achieve this would have been to renapshot the entire data set. So to rewrite a pabyte of data, and that was simply prohibitively expensive. A final point is that interactive analysis in apps like Contour was getting pretty slow as you can imagine.

So the solution of course it won't surprise you was to migrate this entire pipeline over to use iceberg tables. The first and probably most important thing that this gave us was the ability to run automatic compaction. You can see that we reduced the file count file count by 99%.

And the performance implications of this were drastic. The slack message here is a testimonial from a downstream consumer uh who had a pipeline that was taking 2 hours and after that two hours the build simply ran out of memory and failed. After the migration they were able to execute the same pipeline in just 2 minutes.

This is also thanks to things like the metadata management that Iceberg uses. So some of those performance characteristics I alluded to earlier. And on top of these performance benefits, we were able to now do rowle edits and deletions in place.

So that workflow that was simply blocked before became possible uh and and downstream in interactive analysis in apps like Contour was way way easier and this became a much more productive workflow for all the analysts who relied on this data. So that about summarizes what I wanted to talk about with iceberg tables and that speaks to what we're doing in the platform with our our native data storage to improve interoperability and to modernize the platform. I want to just quickly uh point to the fact that we're we're doing things beyond this.

So um in many cases you may have existing data that's stored outside of Foundry. In other platforms maybe BigQuery or Snowflake or data bricks. For these we have virtual tables.

So this allows you to read data from external sources and to use Foundry as if it's a native data set. Um we basically want this experience to feel completely completely analogous to if your data lived within the platform. With that I'm going to pass over to Matt who's going to talk to you a bit about compute.

>> Great. Thanks Ted. So as Ted had discussed on the left side of the slide, we've made a number of interoperability investments in flexible storage.

So this means storing data in traditional uh foundry data sets as iceberg tables and even outside the platform. We have parallel investments for flexible compute. So whereas traditionally you may have experience writing spark pipelines within the platform, we have a number of different options that we're actively investing in as time goes on.

So I want to touch on the fact that we have federated compute which allows you to push compute down to other platforms like bigquery, snowflake or data bricks. But today we're going to focus on lightweight transforms which is our inplatform offering for flexible compute. You can see there we have a couple different runtimes under lightweight polers pandas and duct db.

Uh we're going to chat about those as a way to provide more flexibility into the runtimes and query engines you're using in your transforms in platform. So just to back up before we talk about what lightweight transforms are, I want to highlight why it's important now. So one key thing we've seen in the open source community is that the compute ecosystem is changing.

Whereas beforehand many pipelines of many different scales would have to be handled in a distributed framework like Spark. We've seen an explosion in the number of highly efficient modern query engines on the market today. So I have three of them up on the slide here.

We have Polers, DuctTb, and Apache Data Fusion. These are all highly performant modern single node compute engines that are blowing away benchmarks. So I've also copied over some of the key features that they like to advertise on why you should use their query engines.

Um I want to highlight that there's a couple similarities. So first they're all written in native languages. For polars and data fusion that's going to be Rust and for duct that's going to be C++.

This is important because it allows your pipelines to fully leverage the hardware at hand. whether it's something like parallel vectorized execution or more efficient memory management. The second feature that all these runtimes um highlight is an efficient streaming engine which means you don't have to load your whole data set into memory.

This allows you to run very uh sorry lightweight profiles against very large data sets often operating on data sets that are much larger than memory since you never have to hold the same the whole thing at the same time. So how do we leverage these modern highly performant single node compute engines within Foundry? That's where lightweight transforms come in.

So what are lightweight transforms? It's a simple way to provision single node compute within the platform for pipelines of small to medium size. So I want to highlight some of the key things we've seen here as we've experimented with them internally and out in the field.

Um again we've seen that lightweight pipelines can be highly scalable and performant mainly owing to the query engines they're running under the hood. We have first class APIs for polars, duct db, pandas, >> arrow, >> arrow, and a few others that you know are growing all the time. Um, and we've seen these scale to pretty large data scales.

So you can reliably process tens of gigabytes and for some pipeline shapes even go into the hundreds of gigabytes and terabyte scale on a single node. You're going to get full feature coverage for lightweight transforms as you would with traditional Spark transforms within the platform. So things like incremental, handling media, handling external connections.

We're at par between single node lightweight and your traditional Spark. You're going to see efficient memory usage in a multi-engine scenario. So what that means is you can bring in whatever compute runtime you'd like as a Python package or as your own container that you'd like to run in a single node and leveraging the streaming compute and um native engines that we were chatting about before.

um you're going to see that you're able to process data of unprecedented scale with a very low resource profile. And finally, I want to touch on the fact that we have modern IDE support as folks navigate either writing pipelines in a new framework that they haven't seen before or um migrating old pipelines uh to an uh to a new framework for the efficiency gains. So what do you get here?

Well, we have a modern VS code environment. You can run it either within the platform or locally and push up to your code repository. And this also comes with the continue extension which is an LLM assistant that has access not only to trans the documentation about transforms but documentation about the framework you're using which is going to help you both migrate and author pipelines as well as optimize them if you have um a better rewrite that you could do.

So uh where are we at with lightweight transforms today? Well, we have two separate lightweight offerings within the platform. Um if you're familiar with Python transforms and pipeline builder, we have them both.

So for Python transforms, this is G and in fact the default within the platform. So you can see we're calling at transform.using within the Python decorator. What that does under the hood is you start writing a lightweight and you're going to have a single node provisioned to you.

It's totally configurable. So you can request an exact amount of memory and compute to the transform you want to run. Um and you're off.

We also have an offering for pipeline builder in beta. This is pretty neat because uh it's a load code a low code scenario. So we can translate your pipeline builder to run in Spark or on Lightweight.

It's dead simple. We have a drop down and you just have to click convert to lightweight pipeline. What this is going to do is move you off of Spark and move you to a single node running data fusion.

Um so we're going to chat about a couple use cases we've seen with lightweight and some of the gains we've had. Actually we're going to go a slightly different order. Um we're going to build a lightweight Python transform together.

Um this is going to be notional. I really want to just highlight how flexible this environment is, especially if you come from an environment where you're tied down to just writing Spark or just writing some framework. Uh we're going to go through with an example input and just build up um an a slightly overly complex but very flexible pipeline here.

So you can see at the top we're defining a transform. We we're just um specifying an input and an output and putting that at transform.using decorator on top to define a lightweight Python transform. Next, um, it turns out this table is actually an iceberg table, as Ted had been discussing before.

So, we're going to read it in as iceberg and scan it out. We can then pull in pandas if we choose, um, if it's advantageous to the scenario, convert our iceberg table to pandas, and perform some computation on it. Maybe we're a fan of ductb.

Well, we can read it in as duct db and query it. Maybe we're a fan of polars. We can read in that data set as um, within polers and perform native polers computation on it.

And really I want to highlight the decision of the runtime is pushed to the user. So if you have a shape of pipeline that's optimized for some specific query engine you can bring it in or if you're familiar with authoring in a framework you can bring that in as well. So finally we're going to take our pullers data frame convert it to arrow and run write it back to iceberg.

So now no production pipeline would be written like this with four or five different runtimes. But I just want to highlight that you can do whatever you want and again you can bring in arbitrary Python packages if you want to process in your own way and even bring your own images if you don't want to run Python at all. So um we've seen tremendous adoption of lightweight transform in the field.

We've been using it internally and some of our internal managed pipelines as well as working with customers to migrate um legacy expensive spark pipelines to lightweight. Um I just have highlighted some testimonials from customers and um internal devs alike. Um and we've been seeing some results that are a little bit too good to be true.

We've seen a number of pipelines that are both faster and more resource efficient. So the gains come from a bunch of places. First, we've seen a bunch of places where these runtimes are just faster than Spark.

The second thing is in a single node compute scenario, you're dropping the overhead of running distributed compute. So you're no longer serializing data between nodes or waiting for executives to spin up. And you get the advantages there.

When you combine this with the fact that over time hardware is getting cheaper, memory in particular is getting cheaper and you're allowed to provision much larger single nodes within um comput providers like AWS, Azure or GCP. Um this opens up a whole new world where you can process ultra-large data sets um within lightweight transforms within a single node and run within these highly efficient native frameworks. So I want to zoom in on one internal pipeline that we optimized.

So we have a data set internally at Palunteer which handles events about jobs. So for a number of uh jobs around the fleet we just record like did jobs fail, when did they run and the such. So we often query that in cases like bug fixing and performance analysis and we used to do that with spark.

So this data set is around um it's on the scale of tens of terabytes but for the particular query we're interested in it's again 5 billion rows of input and 240 million rows of output. We can see on the bottom we used to run this with spark the aggregate compute runtime was a day and a half. So this is quite expensive and quite slow.

Um we recently migrated this pipeline to polers and we can see the total compute usage went down to under two hours. So it's both faster and cheaper. Um I want to zoom in a bit on LM translation here.

Um so a lot of folks when dealing with lightweight transforms or new frameworks um are concerned about either the education costs of getting upskilled in a new framework or migration costs. Uh what I have here is a multiundline spark transform. On the left I've just said convert this to polers please.

Under the hood the agent is smart enough to say hey polars can be run in lightweight. So let's convert this spark pipeline to lightweight and then it goes off. So, we've seen a number of cases where uh an LM can completely oneshot pipeline translations and the only human input is in review.

And we've seen an even larger number of cases where it can get you 90% of the way. So, um it can keep you up to date with the Polar API or whatever runtime you want to use. Um and then just have the human finish the last bit.

So, it's been a tremendous efficiency improvement as well. Um that's all I have for lightweight. Unless you have anything else, Ted, I'm super excited uh to share these features features with you and even more excited to see what you build.

Yeah, with that I think we have some time to take any questions you all