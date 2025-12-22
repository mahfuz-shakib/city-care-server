const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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

    // staff verification
    const verifyStaff = async (req, res, next) => {
      const email = req.decoded_email;
      const staff = await staffsCollection.findOne({ email });

      if (!staff) {
        return res.status(403).send({ message: "forbidden access - staff only" });
      }

      next();
    };

    // citizen verification
    const verifyCitizen = async (req, res, next) => {
      const email = req.decoded_email;
      const user = await usersCollection.findOne({ email });

      if (!user || user.role !== "citizen") {
        return res.status(403).send({ message: "forbidden access - citizen only" });
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
      console.log(query,result);

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
    app.patch("/users/:userId", verifyFBToken, async (req, res) => {
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
    app.delete("/users/:userId", verifyFBToken, verifyAdmin, async (req, res) => {
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
      console.log(query,result);
      res.send(result);
    });
    app.get("/staffs/:staffId", async (req, res) => {
      const id = req.params.staffId;
      const query = { _id: new ObjectId(id) };
      const result = await staffsCollection.findOne(query);
      res.send(result);
    });
    app.post("/staffs", verifyFBToken, verifyAdmin, async (req, res) => {
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
    app.patch("/staffs/:staffId", verifyFBToken, verifyAdmin, async (req, res) => {
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
    app.delete("/staffs/:staffId", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.staffId;
      const query = { _id: new ObjectId(id) };
      const result = await staffsCollection.deleteOne(query);
      res.send(result);
    });

    /*******************************/
    //     issue related api
    /*******************************/
    app.get("/issues", async (req, res) => {
      const { email, category, status, priority, search, staffEmail, page, limit } = req.query;
      const query = {};
      if (email) {
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
      
      // Pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;
      
      // Get total count
      const total = await issuesCollection.countDocuments(query);
      
      // Get paginated results
      const cursor = issuesCollection.find(query).sort({ boosted: -1, createdAt: -1 }).skip(skip).limit(limitNum);
      const result = await cursor.toArray();
      
      // Send paginated response
      res.send({
        data: result,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    });

    app.get("/issues/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.findOne(query);
      res.send(result);
      // console.log(result);
    });

    app.post("/issues", verifyFBToken, async (req, res) => {
      const issue = req.body;
      issue.priority = "normal";
      issue.status = "pending";
      issue.createdAt = new Date();
      issue.updatedAt = new Date();
      issue.assignedStaff = null;
      issue.boosted = false;
      const result = await issuesCollection.insertOne(issue);
      
      // Decrement freeReport count for non-premium users
      if (issue.reporter) {
        const user = await usersCollection.findOne({ email: issue.reporter });
        if (user && !user.isPremium && user.freeReport > 0) {
          await usersCollection.updateOne(
            { email: issue.reporter },
            { $inc: { freeReport: -1 } }
          );
        }
      }
      
      // console.log(result);
      res.send(result);
    });

    app.patch("/issues/:id", verifyFBToken, async (req, res) => {
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
      const update = {
        $set: updateIt,
      };
      const result = await issuesCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/issues/:id", verifyFBToken, async (req, res) => {
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
    app.post("/upvotes", verifyFBToken, async (req, res) => {
      const issue = req.body;
      const result = await upvotesCollection.insertOne(issue);
      // console.log(result);
      res.send(result);
    });
    app.delete("/upvotes", verifyFBToken, async (req, res) => {
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
    app.post("/timelines", verifyFBToken, async (req, res) => {
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

    app.post("/boost-payment-session", verifyFBToken, async (req, res) => {
      const issueInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: 10000,
              product_data: {
                name: `Please pay boosting cost for: ${issueInfo.issueTitle}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          issueId: issueInfo.issueId,
          issueTitle: issueInfo.issueTitle,
          issueImage: issueInfo.issueImage,
        },
        customer_email: issueInfo.senderEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });
    app.post("/subscription-payment-session", verifyFBToken, async (req, res) => {
      const userInfo = req.body;
      console.log(userInfo)
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: 100000,
              product_data: {
                name: `Please pay premium subscription cost`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          userId: userInfo.userId,
          userImage: userInfo.photoURL,
        },
        customer_email: userInfo.senderEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    // Get payment session info
    app.get("/payment-session-info", async (req, res) => {
      try {
        const { sessionId } = req.query;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        res.send(session);
      } catch (error) {
        console.error("Error retrieving session:", error);
        res.status(500).send({ message: "Error retrieving payment session" });
      }
    });

    // Post payment info to database
    app.post("/payments", verifyFBToken, async (req, res) => {
      try {
        const paymentInfo = req.body;
        paymentInfo.createdAt = new Date();

        // Derive purpose if not provided
        if (!paymentInfo.purpose) {
          const md = paymentInfo.metadata || {};
          if (md.issueId || paymentInfo.issueId) {
            paymentInfo.purpose = 'Boost';
          } else if (md.userId || paymentInfo.userId) {
            paymentInfo.purpose = 'Premium Subscription';
          } else {
            paymentInfo.purpose = 'Unknown';
          }
        }

        const result = await paymentsCollection.insertOne(paymentInfo);
        // If this payment is a boost for an issue, update the issue priority
        try {
          const purposeLower = String(paymentInfo.purpose || '').toLowerCase();
          const issueId = paymentInfo.issueId || (paymentInfo.metadata && paymentInfo.metadata.issueId);
          if (purposeLower === 'boost' || purposeLower === 'Boost' || issueId) {
            if (issueId) {
              const query = { _id: new ObjectId(issueId) };
              const update = {
                $set: { priority: 'high', boosted: true, updatedAt: new Date() },
              };
              await issuesCollection.updateOne(query, update);
            }
          }
        } catch (err) {
          console.error('Error updating issue priority after payment:', err);
        }
        // If this payment is a subscription, update the user's premium status
        try {
          const purposeLower = String(paymentInfo.purpose || '').toLowerCase();
          const userId = paymentInfo.userId || (paymentInfo.metadata && paymentInfo.metadata.userId);
          if (purposeLower.includes('subscription') || purposeLower === 'premium subscription') {
            if (userId) {
              const userQuery = { _id: new ObjectId(userId) };
              const userUpdate = { $set: { isPremium: true, updatedAt: new Date() } };
              await usersCollection.updateOne(userQuery, userUpdate);
            }
          }
        } catch (err) {
          console.error('Error updating user premium status after payment:', err);
        }
        res.send(result);
      } catch (error) {
        console.error("Error saving payment info:", error);
        res.status(500).send({ message: "Error saving payment information" });
      }
    });

    // Get all payments for a user (admin can see all, users see only their own)
    app.get("/payments", verifyFBToken, async (req, res) => {
      try {
        const { email, userId } = req.query;
        const emailFromToken = req.decoded_email;
        
        // Check if user is admin
        const user = await usersCollection.findOne({ email: emailFromToken });
        const isAdmin = user && user.role === "admin";
        
        const query = {};
        
        // If not admin, only show their own payments
        if (!isAdmin) {
          query.customerEmail = emailFromToken;
        } else {
          // Admin can filter by email if provided
          if (email) {
            query.customerEmail = email;
          }
        }
        
        if (userId) {
          query.userId = userId;
        }
        
        const payments = await paymentsCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error retrieving payments:", error);
        res.status(500).send({ message: "Error retrieving payments" });
      }
    });

    // Get payment by session ID
    app.get("/payments/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const payment = await paymentsCollection.findOne({ sessionId });
        
        if (!payment) {
          return res.status(404).send({ message: "Payment not found" });
        }
        
        res.send(payment);
      } catch (error) {
        console.error("Error retrieving payment:", error);
        res.status(500).send({ message: "Error retrieving payment" });
      }
    });

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
