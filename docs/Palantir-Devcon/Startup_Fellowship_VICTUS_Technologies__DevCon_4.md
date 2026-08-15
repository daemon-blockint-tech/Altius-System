# Startup Fellowship: VICTUS Technologies | DevCon 4

Introducing from Victus Technologies, founder and CEO Jesse Hamel. >> Awesome. Good evening.

Thanks for coming. I'm excited to tell you about Victus and what we built on Palantir Foundry. So let's talk a little bit about Victus Technologies.

I'm Jesse Hamel, founder CEO. And what we do is hyper-scale autonomy for all systems, orbit all the way down to seabed. There's a problem though, and that's what we solve, this particular problem.

So first step back, just think a little bit. 2025 to 2035, I firmly believe this and I'm shared this opinion shared by many. This is the decade of robotics.

For all kinds of reasons, this is when we're actually going to start to see these robotic systems from drones, things in orbit, things in the air, things in the subsurface, humanoids in our home, impacting every area of human activity. One major problem with this, they're all still based on GPS reliance. GPS reliance and Kalman filter algorithms that have largely remained unchanged since the 1960s.

And have effectively made it a Pinocchio string that every robotic system needs to have clear sight all the way up to medium earth orbit. You have a little idea about this. So I'm going to run through this a little bit.

This is from our sandbox, just from Victus Technologies and the and the machine learning algorithm that we have and I'll kind of describe how this works. So you have two swarms here. These are drone swarms in this case.

And what you see is GPS jamming that anybody can do. Any one of us could go build the software to find GPS jammer in about two hours right now. And it can be done in low earth orbit uh almost easily by all kinds of nations right now.

So you see, you have these two drone swarms flying and they receive the GPS jamming. As soon as that GPS jamming hits any system, any robotic system, it undergoes at its navigation state, basically answering the question where am I, the Kalman filter undergoes a quadratic decay. So that you have something that was accurate to about 1 m, if you have a good GPS like what's on your Uber, all of a sudden that expands to about 1.5 km, not really usable for almost any use case.

What we've done, we've created, this is our patent pending tech, is a machine learning state estimator that's pre-trained in a simulation environment, trained on both synthetic and real data, and Foundry is actually critical for how we've done this. On that front end, we then deploy that to the edge device. We've quantized that model down to something that can sit on a edge piece of compute as small as a Raspberry Pi 4, and then it performs that machine learning state estimator at the edge, monitoring the GPS.

So, you can see here the simulated swarm that has Victis Phantom Nav, named the software on board, is able to stay on target and head towards what its mission is, whatever that mission is. Can we switch over to the demo, please? So, we'll give you a little kind of orientation to our architecture here.

So, using solution designer, so you can see basically the end to end is that we simulate the vehicle dynamics. So, we build an agent around what that robotic system is, that drone, that weapon, that aircraft, that ship, that satellite in orbit, whatever it is. We fuse then in Foundry both simulated and real data, perform model training, and then that that then creates our GPS denied ML model.

So, to see kind of the simulation layer of how that works, you have both the vehicle type and the environment. That's all part of it, and I'll show you this on our next VDS configuration, as well as then the simulation all done within Foundry out of our site and I'll show you once I slip over to the next one. Then that that ultimately gives you domain specific simulators.

So, it's domain specific, whether you're in orbit, there's a few different physics things we have to think about in orbit, versus the air, versus maritime, where I have to start thinking about computational fluid dynamics in the Z axis, versus subsurface, when I've got UUVs, drones, autonomous systems, submarines that are sometimes all the way down at the bottom of the ocean doing fiber optic inspection. Different environments, all of that's were accessible through Foundry. So, I'll show that here in the Victus Dynamics simulation config.

And let me show you how it works, right? Uh it's fun. So, we go up here and we start dragging waypoints.

What I'm doing now as the user is I'm saying, "Okay, this is what I have to do." And I'm going to do a really nasty one. I'm going to fly over water, which is where almost no one has a solution outside of Victus for how to do GPS denied anything over water because your computer vision techniques don't work in this environment. So, I'm just dragging the points.

And I'm going over water simulating a mission where I need to stay over the water for whatever that mission is. And then double click and you see, okay, we go down here. You see it orients a bit.

You got 10 waypoints. I can see the distance in meters. I can see the hours for that flight all right here in Foundry.

We go up here, we can name a mission. We can name this mission whatever we want to call it. Let's call it DevCon 4.

And then here I got the domain select. I can select surface. In this case, it's a maritime surface, so it's an unmanned surface vessel.

But it could be subsurface, could be air for a drone, could be orbital. Target speed and I can, you know, pre pre put whatever makes sense for that particular mission in here, describe the mission. I can save it.

And then in the environmentals, this is where the synthetic data really comes in handy of all the data that's accessing. And the environmentals here, I'm looking, okay, what is the wind like this day? What kind of storm conditions?

Is it calm? What kind of sea state do we have? What kind of headwind do we have?

What kind of reservoir conditions? All of which impact robotics in different environments, but that's all accessible for these multi-domain environments right in this same, uh you know, this um this instance. I initiate simulation.

That kind of recages what we just went over. And submit, apply the edits. It's now saved.

Show you what this looks like over in mission control. So, we're over in mission control and I've already got this one pre-done. So, mission control, now I'm going to go back to where we're at.

It's loading objects up here. Okay, so now it's where at. So, you see the full mission that we just planned.

This is one very similar to that that we just planned in here and we're ready to execute that flight in a GPS denied environment. And it's for an environment where we really just can't lose GPS and we're ready to use it and you know, whatever whatever circumstance comes up. You can even see that we've modeled how the GPS if the GPS was gone, where it could go and that's all modeled right here in Foundry.

See the waypoints, uh different controller types, PX4, ArduPilot, MavLink for those that understand drones, and different computes that we can use at the edge. Go back to the uh presentation, please. Yes, so a little on my background and the team.

So, I was in the Air Force for 20 years. I flew AC-130 gunships. I commanded a special operations drone squadron, went to MIT, did a machine learning fellowship, then got a degree there, and then founded Victis out of there.

Joined by uh my brother Jordan, uh who was a striper for many years. Uh Steve Mosko and Garrett who are both here. Uh Steve's a PhD from MIT.

Garrett with his work at Cyber Command. And then we have Uber, we have Netflix, we have uh EY, and then a dedicated government affairs on the team. So, what?

Why does this matter? Why does this matter? Without Victis Phantom Nav trained through Foundry, that's the kind of circular problem that says if I fly a drone or do anything, that I only know I'm somewhere in that circle.

That's it with any kind of GPS anomalies. Not good enough for any reliable autonomous action. With Phantom Victis Nav trained in Foundry, I can put in that kind of accuracy.

Down to 10 m. Again, the takeaway of this is that Foundry brings Victis to really any user, any domain. This is unlocking billions in customer value for both capturing creation across dual use and national security markets.

And we're we firmly believe this after building in in Foundry with the team over the last 2 months, Victis plus Palantir is how we dominate in the robotics age. Thanks.