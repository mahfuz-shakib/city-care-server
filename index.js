const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const stripe = require('stripe')(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;
// const crypto = require("crypto");

// firebase  key
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"], // Allow specific origins
    credentials: true, // Allow credentials
  })
);
app.use(express.json());

// token verify
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pr7icaj.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const cityCare = client.db("cityCare");
    const usersCollection = cityCare.collection("users");
    const staffsCollection = cityCare.collection("staffs");
    const issuesCollection = cityCare.collection("issues");
    const upvotesCollection = cityCare.collection("upvotes");
    const timelinesCollection = cityCare.collection("timelines");

    // admin verification
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    /*******************************/
    //     user related api
    /*******************************/

    // app.get("/users", async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.email = email;
    //   }
    //   const cursor = usersCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });
    // app.get("/users/:userId", async (req, res) => {
    //   const id = req.params.userId;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await usersCollection.findOne(query);
    //   res.send(result);
    // });

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const email = newUser.email;
      const query = { email: email };
      const isExisting = await usersCollection.findOne(query);
      if (isExisting) {
        res.send({ message: "User already exist. Do not needed insert again", currentUser: isExisting });
      } else {
        newUser.role = "citizen";
        newUser.isBlocked = false;
        newUser.isPremium = false;
        newUser.freeReport = 3;
        const result = await usersCollection.insertOne(newUser);
        res.send({ currentUser: result });
      }
    });
    app.post("/staffs", async (req, res) => {
      const newStaff = req.body;
      const email = newStaff.email;
      const query = { email: email };
      const isExisting = await staffsCollection.findOne(query);
      if (isExisting) {
        res.send({ message: "staff already exist. Do not needed create again", currentStaff: isExisting });
      } else {
        newStaff.role = "staff";
        newStaff.isAvailable = true;
        const result = await staffsCollection.insertOne(newStaff);
        res.send({ currentStaff: result });
      }
    });

    // app.patch("/users/:userId", async (req, res) => {
    //   const id = req.params.userId;
    //   const updatedUser = req.body;
    //   const query = { _id: new ObjectId(id) };
    // const user = await usersCollection.findOne(query);

    //   const update = {
    //     $set: {
    //       name: updatedUser.name || user.name,
    //       image: updatedUser.image || user.image,
    //       isBlocked:updatedUser.isBlocked
    //     },
    //   };
    //   const option = {};
    //   const result = await usersCollection.updateOne(query, update, option);
    //   res.send(result);
    // });

    // app.delete("/users/:userId", async (req, res) => {
    //   const id = req.params.userId;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await usersCollection.deleteOne(query);
    //   res.send(result);
    // });

    // issue related apis
    // app.get("/latestResolved", async (req, res) => {
    //   const cursor = productsCollection
    //     .find()
    //     .sort({
    //       date: -1,
    //     })
    //     .limit(6);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    /*******************************/
    //     issue related api
    /*******************************/
    app.get("/issues", async (req, res) => {
      const { email, category, status, priority, search } = req.query;
      // const category = req.query.category;
      console.log("reporter: ", email);
      const query = {};
      if (email) {
        // console.log(email);
        query.reporter = email;
      }
      if (category) {
        query.category = category;
      }
      if (status) {
        query.status = status;
      }
      if (priority) {
        query.priority = priority;
      }
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } },
        ];
      }
      // console.log("query here: ", query);
      const cursor = issuesCollection.find(query).sort({
        date: -1,
      });
      const result = await cursor.toArray();
      // console.log("result: ", result);
      res.send(result);
    });

    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.findOne(query);
      res.send(result);
      // console.log(result);
    });

    app.post("/issues", async (req, res) => {
      const issue = req.body;
      issue.priority = "normal";
      issue.status = "pending";
      issue.createdAt = new Date();
      issue.updatedAt = new Date();
      issue.assignedStaff = null;
      issue.boosted = false;
      const result = await issuesCollection.insertOne(issue);
      // console.log(result);
      res.send(result);
    });

    app.patch("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const updateInfo = req.body;
      const query = { _id: new ObjectId(id) };
      // console.log(query);
      let updateIt;
      if (updateInfo.priority) {
        updateIt = { priority: updateInfo.priority };
      } else if (updateInfo.status) {
        updateIt = { status: updateInfo.status };
      } else if (updateInfo.assignedStaff) {
        updateIt = { assignedStaff: updateInfo.assignedStaff };
      } else if (updateInfo.boosted) {
        updateIt = { boosted: updateInfo.boosted };
      } else {
        updateIt = updateInfo;
      }
      updateIt.updatedAt = new Date();
      const update = {
        $set: updateIt,
      };
      // console.log(update);
      const result = await issuesCollection.updateOne(query, update);
      // console.log(result);
      res.send(result);
    });

    app.delete("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.deleteOne(query);
      res.send(result);
    });

    /*******************************/
    //     upvote related api
    /*******************************/
    app.get("/upvotes", async (req, res) => {
      const { email, issueId } = req.query;
      const query = {};
      const idQuery = {};
      if (email) {
        query.email = email;
      }
      if (issueId) {
        query.issueId = issueId;
        idQuery.issueId = issueId;
      }
      console.log("query: ", query, idQuery);
      const allVotes = await upvotesCollection.find(idQuery).toArray();
      const myVote = await upvotesCollection.findOne(query);
      console.log("result: ", { allVotes, myVote });
      res.send({ allVotes, myVote });
    });
    app.post("/upvotes", async (req, res) => {
      const issue = req.body;
      const result = await upvotesCollection.insertOne(issue);
      // console.log(result);
      res.send(result);
    });
    app.delete("/upvotes", async (req, res) => {
      const { email, issueId } = req.query;
      // console.log(req.query);
      const query = {};
      if (email) {
        query.email = email;
      }
      if (issueId) {
        query.issueId = issueId;
      }
      const result = await upvotesCollection.deleteOne(query);
      // console.log(result);
      res.send(result);
    });

    /*******************************/
    //     timeline related api
    /*******************************/
    app.get("/timelines", async (req, res) => {
      const { issueId } = req.query;
      console.log("timeline: ",issueId);
      const query = {};
      if (issueId) {
        query.issueId = issueId;
      }
      const options = { updatedAt: -1 };
      const result = await timelinesCollection.find(query).sort(options).toArray();
      console.log(result);
      res.send(result);
    });
    app.post("/timelines", async (req, res) => {
      const timelineInfo = req.body;
      const query = { _id: new ObjectId(timelineInfo.issueId) };
      const updatedIssue = await issuesCollection.findOne(query);
      timelineInfo.issueStatus = updatedIssue.status;
      timelineInfo.updatedAt = updatedIssue.updatedAt;
      const result = await timelinesCollection.insertOne(timelineInfo);
      console.log(result);
      res.send(result);
    });

    // payment related apis
    //  app.post('/payment-checkout-session', async (req, res) => {
    //         const parcelInfo = req.body;
    //         const amount = parseInt(parcelInfo.cost) * 100;
    //         const session = await stripe.checkout.sessions.create({
    //             line_items: [
    //                 {
    //                     price_data: {
    //                         currency: 'usd',
    //                         unit_amount: amount,
    //                         product_data: {
    //                             name: `Please pay for: ${parcelInfo.parcelName}`
    //                         }
    //                     },
    //                     quantity: 1,
    //                 },
    //             ],
    //             mode: 'payment',
    //             metadata: {
    //                 parcelId: parcelInfo.parcelId,
    //                 trackingId: parcelInfo.trackingId
    //             },
    //             customer_email: parcelInfo.senderEmail,
    //             success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    //             cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
    //         })

    //         res.send({ url: session.url })
    //     })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("CityCare server is running.....");
});

app.listen(port, () => {
  console.log(`The server is running on port ${port}`);
});
