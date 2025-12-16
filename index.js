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
    const issuesCollection = cityCare.collection("issues");

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
    // user related apis

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

    // app.post("/users", async (req, res) => {
    //   const newUser = req.body;
    //   const email = newUser.email;
    //   const query = { email: email };
    //   const isExisting = await usersCollection.findOne(query);
    //   if (isExisting) {
    //     res.send({ message: "User already exist. Do not needed insert again", currentUser: isExisting });
    //   } else {
    //     const result = await usersCollection.insertOne(newUser);
    //     res.send({ currentUser: result });
    //   }
    // });

    // app.patch("/users/:userId", async (req, res) => {
    //   const id = req.params.userId;
    //   const updatedUser = req.body;
    //   const query = { _id: new ObjectId(id) };
    //   const update = {
    //     $set: {
    //       name: updatedUser.name,
    //       price: updatedUser.price,
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

    app.get("/issues", async (req, res) => {
      const {email,category,status,priority,search} = req.query;
      // const category = req.query.category;
      const query = {};
      if (email) {
        console.log(email)
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
        query.$or=[
          {title:{regex:search,$options:'i'}},
          {category:{regex:search,$options:'i'}},
          {location:{regex:search,$options:'i'}},
        ]
      }
      console.log(query);
      const cursor = issuesCollection.find(query).sort({
        date: -1,
      });
      const result = await cursor.toArray();
      res.send(result);
    });
   
    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.findOne(query);
      res.send(result);
    });

    app.post("/issues", async (req, res) => {
      const issue = req.body;
      issue.priority = "normal";
      issue.status = "pending";
      issue.createdAt = new Date();
      issue.assignedStaff = null;
      issue.voteCount = 0;
      issue.boosted = false;
      const result = await issuesCollection.insertOne(issue);
      console.log(result);
      res.send(result);
    });

    // app.delete("/products/:productId", async (req, res) => {
    //   const id = req.params.productId;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await productsCollection.deleteOne(query);
    //   res.send(result);
    // });

    // app.patch("/products/:productId", async (req, res) => {
    //   const id = req.params.productId;
    //   const query = { _id: new ObjectId(id) };
    //   const update = {
    //     $set: {
    //       name: req.body.name,
    //       category: req.body.category,
    //       price: req.body.price,
    //       location: req.body.location,
    //       description: req.body.description,
    //       image: req.body.photo,
    //       email: req.body.email,
    //       date: req.body.date,
    //     },
    //   };
    //   const result = await productsCollection.updateOne(query, update);
    //   res.send(result);
    // });

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
