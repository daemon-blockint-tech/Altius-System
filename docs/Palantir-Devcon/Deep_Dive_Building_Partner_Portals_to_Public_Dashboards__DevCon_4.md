# Deep Dive: Building Partner Portals to Public Dashboards | DevCon 4

Please welcome from Palunteer Dylan Cook and Alexandrew Below. >> How's it going? I'm Dylan.

Uh I'm a software engineer on Palunteer Foundry working on consumer mode. >> And I'm Alex. I'm a software engineer on the developer suite and I'm working on public applications.

[snorts] So today what we're going to talk to you about is how you can build external facing or consumer applications uh using Foundar's native infrastructure. Um we're going to walk through a couple things but in particular we want to highlight now we've we've done a lot of work to make it uh easier faster to build those applications on Foundry as well as make those applications more secure leveraging native infrastructure in Foundry. Um, additionally, uh, in this presentation, uh, we're going to walk through a example application that highlights what we mean when we say consumer mode.

Um, and we're going to talk about how you would have previously had to build these applications before um, and how much easier it is to build now um, and talk through the differences in architectures. So, uh, the example site that we're going to talk through is a notional insurance site that we built. Um it's basically uh it has two core components.

One is a public-f facing form where you can get uh quotes for auto insurance. Uh if the user likes the quote, they can sign up and convert that into an actual insurance policy. All of this is possible on Foundry.

Um and so the core things that we want to highlight are the fact that you can now have a public application. You can then authenticate into a authenticated app. uh then users can only see the data in each of those scenarios that they should see uh as well as no uh ability to investigate or see any of Foundry as a platform or Foundry as your back end.

So uh let's talk about how you would have had to do this before if you wanted to build these applications uh based on the ontology. So previously uh you would have had to let's say for this public application um you would have needed first a service token so that that service token could uh load objects from foundry um specifically against the ontology API so you can load whatever objects or entities it is that you want to load. Um then that service token also needs to be in an external server so that users can't access the token so it's secure.

Um, you would then proxy the endpoints that that service token hit through the API. Um, so that the public application can have access to any ontology entities that you want that app to see. Uh, and you would also need a file server to serve any artifacts for that public site.

Um, and then switching over to the authenticated application side. Uh, it's similar, but there's a little bit more that you have to do. uh if you want to build an authenticated application where all they can see is the app.

So you would also need to have an authentication integration with any of your identity providers. Um then that's to identify that users are who they say they are. Uh then you would write logic uh for authorization um against those users so they can only see the objects that they're supposed to see rather than all of the objects that the service token can have access to.

Um, and again then you would have an artifacts and APA layer for your actual site. So that's how it was before. We've done a lot of work to actually make this much easier and we've brought all of that into Foundry.

So now you just say what objects you want to expose over your public API, what artifacts you want to expose over your public API and that can power your public application directly. And the same thing on the authenticated side, we now give you tools to uh reduce the platform access that people have. So they can actually only access the application rather than Foundry as a platform.

And this all leverages Foundry security primitives. So you don't have to write the authorization logic or authentication logic yourself. You get to leverage Foundar's built-in best practices.

Um, so why don't we walk through an actual demo uh so you guys can actually see what this actually would feel like from the user experience side of things. >> Thanks Dylan. Let's jump into the demo.

So to first reintroduce the use case, let's say we're trustguarded shirts and we provide [snorts] card shirts and we've built our organization on top oflogy. Our goal as trust guard assurance is to provide a consumerf facing platform that allows prospective customers to request quotes and if they're interested sign up and pursue policies. Um as Dylan said in the previous state of the world, you would have to do this outside of Foundry.

But now we're excited to announce that we can do this inside Foundry through hosting with public apps in consumer mode. So as we uh to navigate to our demo on the left side we have um a consumer website. This is something that me and you would be able to see if we were maybe interested in car insurance.

On the right we actually have a foundry instance with an administrator workshop. And this workshop uh uses an automate to take incoming quote requests and generate quotes for users. So now let's jump into the demo and let's uh navigate back to the left.

So let's say I am just a public internet user. I haven't logged in yet and I'm just shopping for car insurance. Um I stumbled across Trust Insurance and I just want to see if maybe their quote is going to be good enough for me to pursue.

So, let's here navigate to get your quote. And here, as we can see, we have a few options for vehicles. And I'm going to choose the RAV 4 here.

In addition, I'm just going to put put some of my name information and my email and then uh phone number and then I will choose full coverage. So before I submit this quote request, something I want to emphasize is that both that vehicle load and then this quote submission were interactions with the ontology. When I submit this quote request, we're actually going to see an administrator portal a brand new object being created.

And one thing to notice is that through this entire flow, I haven't logged in yet. I haven't signed up for um this car insurance. I haven't done anything.

This is all been from an unauthenticated context and allows me to interact with the organization without having to um commit. So let's submit our call request. Let's see what's happening.

And yeah, so now we receive this call request here. And then now we'll begin an automate with AIP to generate a quote. And then the main thing to emphasize is that everything we have just shown was entirely built on top oflogy and um is entirely hosted in the in foundry as well.

So now we'll give it a second for the quote to appear and we uh can say that um yeah gives one more second but let's assume that once this quote appears we have um received an email. I won't show the email just because it's not important for the demo. And let's say I'm interested in pursuing the um the trust guard insurance.

So let's um now begin the signup flow. So here I am just going to be able to sign up with Google and this highlights that second part of our work. Um, now with consumer mode, you're able to have custom authentication that allows you underneath the hood to still create a Foundry user, but from a consumer's perspective, they're just interacting with your organization.

So here, I'm just going to log in real quick and um just sign in with O0. It looks like the quote took a little longer than expected. Um, but now as you can see here, the quote that we just generated is actually associated with the email I registered.

So to emphasize, we were able to go from an unauthenticated context, able to read and write to the be able to then sign up for Foundry on the fly and then begin interacting with the organization. So you might be asking, how is this actually working? Is this better than um just deploying uh through like an external service?

So let's see how we're actually doing this. So now I've navigated back to the right and we're looking at our developer console view. So here this is um where you're able to build your applications and deploy them.

And we offer a bunch of different functionality inhouse in here that just allows you to configure your application with a simple UI. We offer the ability for you to manage your resources on your authentication client. This allows you to make sure that you're only exposing what you want to expose.

You could also um write your code in platform and use git to manage it. And then finally, you could deploy your code with this client all on an example website. So now you might be asking, so so this is a public app.

This is unauthenticated. How are we making sure that what we're showing is safe for the for public internet users to see? So, first I'm going to navigate back to our unauthenticated website here.

So, as you notice, I am not logged in and we're going to go to our vehicle tab. These are object loads and in navigating back to the right in our resources, we have both the quote requests and the vehicle object. we can actually manage what explicitly what is allowed in the public context through the scope.

So if I remove the vehicle from here we will see that um through a refresh on our page we will no longer be able to fetch vehicles and we'll give this one second as we have caching. Perfect. So now I've hidden it from view you no public internet user can see these vehicles.

Now let's say we want to add this back. Um when we are adding these um different objects, we actually have restrictions on what is allowed to be added and we make sure we have a governance policy that protects you from adding something that might be sensitive or private to a public context. So here I'm going to review my changes.

And as we can see here, it gives us a warning. But since vehicles are safe to put publicly, I'm just going to acknowledge. So, we'll just add this back.

It will get uh it will take a second to be added and then we can probably refresh this and then boom, our vehicles are back. So, the thing here to emphasize is that you can control the your data security all in the developer console through our public apps governance system and you can deploy these public apps through developer console as well. Now I'm going to hand it back off to Dylan to talk more about how we can protect on the consumer mode uh use case.

>> Thanks Alex. So what we're going to walk through now is uh you have this authenticated application. The user can see what they need to see in the public and the authenticated situations.

However, um let's say this user gets a little uh ambitious and says I want to see how this thing was built. And so they decide that they want to navigate directly to the stack. So right now uh without the controls that we were talking about that we added the user would be able to see the stack.

They would be able to see applications. They're basically looking at Foundry as your backend which is not something that you want. Um so instead what we can do uh is we actually have the ability to restrict what applications users have access to.

Um, additionally, when a user navigates, they can also see potentially other users on the platform unless you lock it down. Again, for a consumerf facing application, this is bad. You don't want users to see other users on the stack.

And so, we give you tools to lock down applications, users, groups, as well as the APIs themselves. So, we're going to walk through how you would actually do this. So this is control panel.

It's essentially the administrator's toolbox for foundry. Um and the organization management extension uh has a one an option called member managed or manage member discovery. Um it gives you the ability to turn user discovery and group discovery off.

So when we enable this, this essentially takes all users that are within this organization and means that you can no like no users within that or can find each other. The nice thing is is this actually gives you pretty granular collaboration control. So you can turn off discovery within an organization while still allowing users to discover organizations, let's say, of another business if you want that or like no one else.

um that granular control uh gives you much more flexibility for the types of applications and collaboration that you can get out of the box. So uh really quick let's refresh. Okay, so previously you could see other users.

Uh now you can only see yourself um this the the customer that Alex had created when he initially signed up for the application. So, additionally, let's also go back and uh we can show how you can disable application access more broadly. So, there's a another control panel extension called application access that lets you disable discovery of all applications.

Um, and so we can lock this down so only um only insurance app admins can actually see Foundry as a platform. So your consumer app users will only be able to access their application and won't be able to see Foundry more broadly. Um so now that this is applied we should be able to just see great now I don't have us I don't have access to Foundry which is exactly what what you want.

This is how you disable AP or application access. Um and now we also have public docs that walk through exactly how to enable consumer mode. So whether it's application access that you want to disable, whether it's certain collaboration setups that you want, or whether it's API access restrictions, all of that's possible with consumer mode.

Uh the docs are public, always happy to chat over any of this stuff. Um, sweet. So I think that's it for the demo and I think we're going to hop back to slides.

All right. So just a quick recap of what we walked through. We had talked through before that how you would have built a public application backed by OSDK apps.

Uh how you now can build authenticated and public applications all on Foundry leveraging those security primitives. Um and the new public infrastructure uh for hosting your APIs and artifacts. Um, we've made it a lot easier to now do this in Foundry without needing to manage your own infrastructure, without needing to manage credentials, without needing to write custom integrations either for authorization or authentication.

Um, all of this should make it much easier uh to build these applications and faster as well as keeping them secure for your customers. So, yeah, that's that's really what we wanted to share. Um, and uh, yeah, we're excited to see what you build.

Thank you guys. Yeah, that's it. [applause]