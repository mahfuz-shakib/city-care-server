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
    const paymentsCollection = cityCare.collection("payments");

    // admin verification
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    /*******************************/
    //     user related api
    /*******************************/
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      const role = req.query.role;
      const query = {};
      if (email) {
        query.email = email;
      }
      if (role) {
        query.role = role;
      }
      const cursor = usersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/users/:userId", async (req, res) => {
      const id = req.params.userId;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const token = req.headers.authorization;
      console.log(token);
      // if (token) {
      //   // Logged-in user, check if admin
      //   try {
      //     const idToken = token.split(" ")[1];
      //     const decoded = await admin.auth().verifyIdToken(idToken);
      //     req.decoded_email = decoded.email;
      //     const user = await usersCollection.findOne({ email: req.decoded_email });
      //     if (user && user.role === "admin") {
      //       // Admin creating staff
      //       const newStaff = req.body;
      //       const existingStaff = await usersCollection.findOne({ email: newStaff.email });
      //       if (existingStaff) {
      //         res.send({ message: "Staff already exists", currentStaff: existingStaff });
      //       } else {
      //         await admin.auth().createUser({
      //           displayName: newStaff.displayName,
      //           password: newStaff.password,
      //           email: newStaff.email,
      //           photoURL: newStaff.photoURL,
      //         });
      //         newStaff.role = "staff";
      //         newStaff.isAvailable = true;
      //         const result = await usersCollection.insertOne(newStaff);
      //         res.send({ currentStaff: result });
      //       }
      //     } else {
      //       res.status(403).send({ message: "Only admins can create staff accounts" });
      //     }
      //   } catch (err) {
      //     res.status(401).send({ message: "Invalid token" });
      //   }
      // } else {
      // New user registration
      const newUser = req.body;
      const existing = await usersCollection.findOne({ email: newUser.email });
      if (existing) {
        res.send({ message: "User already exists", currentUser: existing });
      } else {
        newUser.role = "citizen";
        newUser.isBlocked = false;
        newUser.isPremium = false;
        newUser.freeReport = 3;
        const result = await usersCollection.insertOne(newUser);
        res.send({ currentUser: result });
      }
      // }
    });
    app.patch("/users/:userId", async (req, res) => {
      const id = req.params.userId;
      const updateInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updateInfo,
      };
      const option = {};
      const result = await usersCollection.updateOne(query, update, option);
      res.send(result);
    });
    app.delete("/users/:userId", async (req, res) => {
      const id = req.params.userId;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    /*******************************/
    //     staff related api
    /*******************************/
    app.get("/staffs", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = staffsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/staffs/:staffId", async (req, res) => {
      const id = req.params.staffId;
      const query = { _id: new ObjectId(id) };
      const result = await staffsCollection.findOne(query);
      res.send(result);
    });
    app.post("/staffs", async (req, res) => {
      const { displayName, email, password, photoURL } = (newStaff = req.body);
      console.log(newStaff);
      // const query = { email: email };
      const isExisting = await staffsCollection.findOne({ email });
      if (isExisting) {
        res.send({ message: "staff already exist. Do not needed create again", currentStaff: isExisting });
      } else {
        admin.auth().createUser({
          displayName,
          password,
          email,
          photoURL,
        });
        newStaff.role = "staff";
        const result = await staffsCollection.insertOne(newStaff);
        res.send({ currentStaff: result });
      }
    });
    app.patch("/staffs/:staffId", async (req, res) => {
      const id = req.params.staffId;
      const updateInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updateInfo,
      };
      const option = {};
      const result = await staffsCollection.updateOne(query, update, option);
      res.send(result);
    });
    app.delete("/staffs/:staffId", async (req, res) => {
      const id = req.params.staffId;
      const query = { _id: new ObjectId(id) };
      const result = await staffsCollection.deleteOne(query);
      res.send(result);
    });

    // app.get("/users/:email/role", async (req, res) => {
    //   const email = req.params.email;
    //   const query = { email };
    //   const user = await usersCollection.findOne(query);
    //   res.send({ role: user?.role || "citizen" });
    // });
    /*******************************/
    //     issue related api
    /*******************************/
    app.get("/issues", async (req, res) => {
      const { email, category, status, priority, search, staffEmail } = req.query;
      // const category = req.query.category;
      // console.log("reporter: ", email);
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
      if (staffEmail) query["assignedStaff.email"] = staffEmail;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } },
        ];
      }
      console.log("query here: ", query);
      const cursor = issuesCollection.find(query).sort({ boosted: -1, createdAt: -1 });
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
      console.log(updateInfo);
      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);
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
        if (!updateInfo.image) {
          updateInfo.image = issue.image;
        }
        updateIt = updateInfo;
      }
      updateIt.updatedAt = new Date();
      console.log(updateIt);
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
      // console.log("query: ", query, idQuery);
      const allVotes = await upvotesCollection.find(idQuery).toArray();
      const myVote = await upvotesCollection.findOne(query);
      // console.log("result: ", { allVotes, myVote });
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
      // console.log("timeline: ",issueId);
      const query = {};
      if (issueId) {
        query.issueId = issueId;
      }
      const options = { updatedAt: -1 };
      const result = await timelinesCollection.find(query).sort(options).toArray();
      // console.log(result);
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

    /*******************************/
    //     payment related api
    /*******************************/

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
