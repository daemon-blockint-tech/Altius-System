# Deep Dive: Interoperability at Scale with the Multimodal Data Plane | DevCon 5

Hello everyone. Uh thank you very much for coming. Today, I'm going to talk to you about the latest and greatest in the multi-modal data plane.

Uh but before I explain what that is, I'll quickly introduce myself. So, I'm Ted. Uh I co-lead our data plane group.

Broadly speaking, we look after all of the core data platform features within Foundry. So, uh a lot of you are probably going to be thinking off the bat, what is a multi-modal data plane? It's our open data and compute architecture that allows you to integrate, manage, and ultimately extract value from your data.

It supports structured data, unstructured data, media, time series, and streams. And at the crux of it all, uh we want to provide this without requiring you to do lengthy migrations or expensive re-platforming efforts. Everything should just work seamlessly.

In a single phrase, it's the foundation of our AI platform. So, in a more concrete terms, uh let me give you an overview of some of the products that fall into MMDP. You can broadly break the data platform down into three pillars.

In the core, we have features that run across the entirety of Foundry and AIP. These are based around orchestration and governance. They provide functionalities like data lineage, our enterprise pipeline management tooling, and of course, our best-in-class security model.

They're absolutely core to the development of MMDP. And whether we're building interoperability with external platforms or extending the feature set of our internal data platform, these are always critical and we never compromise. On the left, you can see we have storage.

And the theme here is interoperability. Whether data is stored externally or whether it's stored within the platform, all of our products should work seamlessly, and there should be no uh there should be no gaps. The the most popular product which really encompasses this to date is virtual tables, which allow you to store references to externally stored data sets.

These could be in platforms like Databricks, BigQuery, or Snowflake. All of our analytics, pipeline, and ingestion into ontology features work seamlessly with these as if they were natively hosted data sets. A more nascent project is our undertaking of providing native iceberg tables.

The key motivator for this was to unlock the interoperability features that iceberg brings brings as an open standard. But on top of this, we get a bunch of extra really cool features in the platform and some pretty nice performance upgrades, too. So, these two interoperability plays are on top of our core multi-modal data architecture, which we get from media sets, streams, and data sets.

All of which can power multi-modal models in the platform. Finally, on the right here, um I have our compute pillar. And the theme here is flexibility.

In the platform, we allow you to choose the most appropriate compute for the job. So, for real-time processing, you can use Flink on top of streams. For low-latency, hyper-efficient batch transformations, you can use our single node compute engine offerings.

And then for big data, you can utilize Spark. On top of these in-platform offerings, we allow you to push down compute to external systems through our federated compute. A more recent area of investment has been SQL.

We undertook this as a way of exposing Foundry compute in a way that was more familiar to more users, helping make the the whole platform more accessible. Today, I'm going to do a real deep dive on two of these, federated compute and SQL. We're going to start with SQL.

Our investments in this space run really deep in the platform. But the primary thing that you're going to notice will probably be the new SQL console. It looks like a pretty standard SQL editor and is very lightweight and minimal.

It allows you to run queries on both data sets and ontologies. It allows you to create and update tables. And it allows you to save these analyses in worksheets in your compass file tree.

So, the question that you might ask off the bat is, why do we care so much about investing in SQL? Well, SQL truly is the lingua franca of data. By allowing users to work with ontologies and data sets with SQL, we fully democratize access.

There's no Palantir syntax, no special jargon, no uh custom tool chains required. I can't count the number of times where I've been on-site with a customer or I've spoken to a guardian at previous DevCons, and they've told me that an org of data scientists and data engineers have an entirely SQL-based tool chain. And when they have to migrate to Foundry, this causes friction.

These are the kind of barriers that we're looking to remove and allow you to extract as much value as possible from AIP. Another major benefit of SQL is that it's fast by design. Its simplicity allows editors to stay lightweight and snappy, and it allows engines to perform uh very very well.

To fully leverage this, we've actually built out two new query engines, one for data sets and one for ontologies. So, in the data set case, we have Furnace, and this decouples the SQL query syntax from the underlying execution engine. This has two main benefits.

The first is that we can use heuristics to route to the most appropriate compute possible, but it also means that we can pick up on the latest and greatest in query engine technology without breaking user queries. The final and perhaps the most exciting uh benefit of adopting SQL is that it's perfectly suited to an agentic world. LLMs have long proved that they're really good at writing SQL queries.

This will come as no surprise to anyone who's used AIFDE or the Foundry MCP server, as the SQL tool gets used incredibly extensively in both. As we invest in the actual behaviors that we support through SQL, we're unlocking more functionality in a syntax that is very well supported by these models. So, a SQL editor.

It's not particularly revolutionary, right? Well, that's right. And this is why I said our SQL investments run deep.

The SQL console is just an interface, but it's not the reason you should be getting excited about SQL in Foundry and AIP. This is a reflection on what we've known here at Palantir for a long time, which is that a SQL editor on its own is a useful tool, but it doesn't provide value in production workflows. What you should instead be excited by is the integrations that we're building out.

So, yes, you can analyze ontologies and you can analyze data sets. But more importantly, you can power agents. As I already said, it's used extensively by AIFDE and in in Foundry MCP today.

And as we add more and more functionalities, it's going to allow agents to interact with the platform in an idiomatic way. We allow you to transform data in place for the first time in Foundry, which unlocks new rapid prototyping flows. And finally, we shipped SQL functions, which allow you to define functions on top of your ontology in SQL, providing a new and incredibly easy way to build with ontology.

I have a short demo that runs you through the suite of features. Um so, as you would expect, we're able to run some queries here, which look at data sets in our platform. We can load up a worksheet that has some saved analysis and run through these queries.

As I said, these worksheets are compass resources, so they can be shared between you and your colleagues. We can then take advantage of an all-new feature, the ability to run a create table statement and materialize the results of a query. This was never possible in an interactive interface like this before, but you'll see that under the hood, it still just runs a build, meaning it's fully integrated with our orchestration and governance, and things like data lineage work exactly as you would expect.

In the video, I go on to take an object type, uh sorry, build an object type off of the table that I just created. The reason I'm doing this is so I can show off some of the ontology SQL functionalities, but I've sped it up here for convenience. I wanted to keep the whole video uh without any breaks, though, um just so I could show you how easy it is to go from analyzing data sets, transforming your data into the shape to ingest into ontology, bringing it through to the ontology, and then going on into the app building, AI, and and ultimately value creation layer of the platform.

So, you can see from ontology manager, we have the same SQL console interface. Only this time, we have ontology resources in our explorer. I can once again run interactive queries on top of this.

You can see here that I do a basic filter just to get a single row from the object type. And then when I'm happy with my analysis, I can save it in a worksheet. There's actually two states of the worksheets.

There's a draft state, which is private and auto-saves and allows you to iterate on some analysis. And then when you're happy with it, you can save it as a fully fledged file. Once saved, we can publish a function, and it literally takes one click, a few fields, and you're ready to go.

This function can then be used from workshops, actions, whatever you want. I think that this is particularly exciting as it's one of the fastest ways to get through to that app building layer of the platform. So, hopefully, based on what you've seen, you're excited.

But, I want to tell you that we're far from done. As I said, we want to make SQL a fundamental building block in the platform that allows you to leverage the full AIP ecosystem. As such, we have many more integrations to build.

Firstly, we want to build a workshop integration to allow you to leverage SQL queries and SQL analysis from AIP applications. We want to add support for SQL object sets so that you can maintain the semantic layer of the ontology on top of the output of your queries. We want to allow you to embed these analysis in reports so that you can create artifacts that are more meaningful than the raw data alone.

We want to allow you to store procedures so that you can modularize pieces of logics and and reuse them in multiple places. We want SQL enterprise pipelining capabilities to allow you to take these analysis and scale them into something for production workflows. And finally, we want integrations in our data catalog to give you a new way of exploring your data.

The next thing I wanted to talk about was federated compute. I really like this diagram as I think it's a good representation of how a lot of Palantirians think about AIP. At the top layer, we have the ontology, which forms the foundation of our value and decision-making layer.

That's what's powering agents, automations, and applications. Below that, in the core, we have governance and orchestration. And this is what allows you to deploy and to run these applications at scale.

And then in the foundation, we have the multi-modal data plane. This layer exists to get your data into the ontology as quickly and as easily as possible. We recognize that to do that, it may mean taking advantage of existing resources in your organization, fitting seamlessly into whatever data architecture you already have set up, or just working around existing barriers that exist in messy real-world situations.

So, to power the multi-modal data plane, we have both in-platform compute and federated compute. A few years ago, our data platforming capabilities looked something like this. You had a Foundry data set input.

You could define a transformation on that, which would run in Spark, and you would output to another Foundry data set. Now, Spark was a pretty reasonable choice here. It can run arbitrary data scale.

It'll work for a a 1 MB table, and it will work for a 1 PB table. However, a jack of all trades is a master of none. And the compute landscape has shifted significantly since Spark was originally developed.

In recognition of this fact, we invested heavily in compute optionality in the platform. We added support for single node compute engines like Polars, DuckDB, and DataFusion. This was in response to the fact that we now run in a cloud-native way, instead of running on commodity hardware where we need to share the load of compute between a bunch of machines together.

On top of that, advancements in GPU and CPU architectures have meant that the parallel processing that we can leverage on a single machine has greatly improved. As such, these single node engines are able to deliver incredible performance and efficiency characteristics. Seeing the adoption across the fleet since we initially rolled this out has been amazing, and it's been particularly cool to see the latency-critical workflows that were previously not possible with batch compute, but can now be delivered with these single node engines.

Uh if you would like to hear like more detail about these offerings in particular, we actually did a deep dive on this last DevCon, which you can find on YouTube. We built on this flexibility that we established with the options to choose single node compute compute engines. And we extended the virtual table primitive that existed in the platform.

So, as I already mentioned, virtual tables allow you to essentially store references to externally stored data. And in the platform, they look just like a regular data set. Well, what we then did is we allowed you to define a transform on that data just as you would be able to do with any other data set.

But, what was special is that the compute would run in the external source system. This shows our commitment to two things. Firstly, it shows that you're able to leverage whatever compute makes most sense for your organization and use case.

And secondly, it shows the commitment to fit with existing data architectures. There is one key problem with this architecture, though, and it's that the data and the compute must be co-located and federated. While in some cases this makes perfect sense, it does have the downside that it means you're tightly coupled to whatever external system you choose.

A more recent development is our deep integration with Snowflake, allowing you to leverage Snowflake compute on top of Foundry-defined transforms in the platform. So, as you can see here, with a Foundry Iceberg input table and a Foundry Iceberg output table, you now have the choice of single node compute, Spark, or Snowflake. What's particularly special about this is that you can continue to leverage the orchestration, governance, and pipeline authoring features of Foundry while leveraging Snowflake's compute.

For me, this is an incredibly energizing workflow to deliver on as it really hits at the crux of what MMDP is trying to achieve. That is a truly interoperable data plane where there are no caveats, it's low friction, and it's a real first-class offering. I have a short video that shows you just how first-class this is.

So, from a table, you can go to create a pipeline builder pipeline as you normally would, and at the bottom, where you would normally select between Spark or single node, you can also select to choose external compute. Here, we set it up with an existing Snowflake connection, and this connection just tells the pipeline where the compute should run. From there, you get a completely normal pipeline authoring experience in pipeline builder.

And this to me is what is so special about this offering. Pipeline builder, in my opinion, is one of our most impressive applications. It's so strongly typed, it's so feature-rich, and there's really nothing else like it on the market.

To be able to take advantage of this in your broader data architecture is a humongous win. In this case, we're just defining a really simple pipeline that filters down to a single row. And as you can see, all of the normal pipeline capabilities like preview work exactly as they would with any other pipeline builder pipeline.

When we go ahead and run this, you'll be able to see that the compute is running in Snowflake. And once that underlying query gets kicked off, we actually get a nice button that can take us to the external platform and actually show us where that compute ran. So, just to round out discussion, I wanted to frame how you should think about data plane in the broader context of AIP today.

Over the next 2 days, you're going to see a ton of really cool demos and products that make use of AI and agentic flows. But, the success of all of these depends on your data, your ability to scale, and your ability to build. That is what we are here to deliver on.