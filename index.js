const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;

// firebase  key
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);
// const serviceAccount = require("./city-care-firebase-adminsdk.json");
const { issuesMetrics } = require("./utils");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(express.json());

const allowedOrigins = ["http://localhost:5173", "http://localhost:3000", "https://city-care0.netlify.app"];
// ✅ MUST be before routes
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false); // ⚠️ don't throw error
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// middlware
// token verify
const verifyFBToken = async (req, res, next) => {
  // console.log(req.query);
  if (req?.originalUrl.startsWith("/issues/?") && !req.query.email) {
    next();
    return;
  }
  if (!req.headers || !req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
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

    // this ensures that: ami sudhu e amr data access korte parbo /// only admin sob parbe
    const verifyValidUser = async (req, res, next) => {
      const loggedUser = await usersCollection.findOne({ email: req.decoded_email });
      if (loggedUser && loggedUser?.role === "admin") {
        next();
        return;
      }

      const params = req?.params || null;
      let email, user;
      if (params) {
        if (loggedUser && params.userId) user = await usersCollection.findOne({ _id: new ObjectId(params.userId) });
        else user = await staffsCollection.findOne({ _id: new ObjectId(params.staffId) });
      }
      email = req.query.email || req.body.email || user?.email;
      if (email && email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    /*******************************/
    //     role check api (single call, no verifyValidUser needed)
    /*******************************/
    app.get("/role", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      // Check users collection first (citizen / admin)
      const user = await usersCollection.findOne({ email }, { projection: { role: 1 } });
      if (user) return res.send({ role: user.role || "citizen" });
      // Not in users → check staffs collection
      const staff = await staffsCollection.findOne({ email }, { projection: { role: 1 } });
      if (staff) return res.send({ role: "staff" });
      // Unknown — treat as citizen so the app doesn't crash
      return res.send({ role: "citizen" });
    });
    app.get("/getMyInfo/:email", async (req, res) => {
      const email = req.decoded_email || req.params.email;
      // Check users collection first (citizen / admin)
      const user = await usersCollection.findOne({ email });
      if (user) return res.send(user);
      // Not in users → check staffs collection
      const staff = await staffsCollection.findOne({ email });
      if (staff) return res.send(staff);
      // Unknown — treat as citizen so the app doesn't crash
    });

    /*******************************/
    //     user related api
    /*******************************/
    app.get("/users", verifyFBToken, verifyValidUser, async (req, res) => {
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
    // maybe this api is not used but not sure
    app.get("/users/:userId", verifyFBToken, verifyValidUser, async (req, res) => {
      const id = req.params.userId;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const userExisting = await usersCollection.findOne({ email: newUser.email });
      const staffExisting = await staffsCollection.findOne({ email: newUser.email });
      if (userExisting || staffExisting) {
        res.send({ message: "User already exists", currentUser: userExisting });
      } else {
        newUser.role = "citizen";
        newUser.isBlocked = false;
        newUser.isPremium = false;
        newUser.freeReport = 3;
        newUser.reports = 0;
        newUser.solved = 0;
        newUser.createAt = new Date();
        const result = await usersCollection.insertOne(newUser);
        res.send({ currentUser: result });
      }
    });
    app.patch("/users/:userId", verifyFBToken, verifyValidUser, async (req, res) => {
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
    app.delete("/users/:userId", verifyFBToken, verifyValidUser, async (req, res) => {
      const id = req.params.userId;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    /*******************************/
    //     staff related api
    /*******************************/
    app.get("/staffs", verifyFBToken, verifyValidUser, async (req, res) => {
      const { email, department, search, page, limit } = req.query;
      const query = {};
      if (email) {
        query.email = email;
      }
      if (department && department !== "All Staff") {
        query.department = department;
      }
      if (search) {
        query.$or = [
          { displayName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { department: { $regex: search, $options: "i" } },
        ];
      }

      const limitNum = Number(limit) || 8;
      const currentPage = Number(page) || 1;
      const skip = (currentPage - 1) * limitNum;
      const total = await staffsCollection.countDocuments(query);
      const cursor = staffsCollection.find(query).skip(skip).limit(limitNum).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send({
        data: result,
        pagination: {
          page: currentPage,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    });
    app.get("/staffs/:staffId", verifyFBToken, verifyValidUser, async (req, res) => {
      const id = req.params.staffId;
      const query = { _id: new ObjectId(id) };
      const result = await staffsCollection.findOne(query);
      res.send(result);
    });
    app.post("/staffs", verifyFBToken, verifyValidUser, async (req, res) => {
      const { displayName, email, password, photoURL, department } = (newStaff = req.body);
      const userExisting = await usersCollection.findOne({ email });
      const isExisting = await staffsCollection.findOne({ email });
      try {
        if (userExisting || isExisting) {
          res.send({ message: "user already exist. Do not needed create again", currentStaff: isExisting });
        } else {
          admin.auth().createUser({
            displayName,
            password,
            email,
            photoURL,
          });
          newStaff.role = "staff";
          newStaff.ratings = 0;
          newStaff.activeTasks = 0;
          newStaff.resolvedTasks = 0;
          newStaff.createdAt = new Date();
          newStaff.averageDays = 0;
          const result = await staffsCollection.insertOne(newStaff);
          res.send({ currentStaff: result });
        }
      } catch (error) {
        res.send({ error, message: "Staff creation failed." });
      }
    });
    app.patch("/staffs/:staffId", verifyFBToken, verifyValidUser, async (req, res) => {
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
    app.delete("/staffs/:staffId", verifyFBToken, verifyValidUser, async (req, res) => {
      const id = req.params.staffId;
      const query = { _id: new ObjectId(id) };
      const result = await staffsCollection.deleteOne(query);
      res.send(result);
    });

    /*******************************/
    //     issue related api
    /*******************************/
    app.get("/issues", verifyFBToken, async (req, res) => {
      const { email, category, status, priority, search, staffEmail, page, limit } = req.query;
      const query = {};
      if (email) {
        query.reporter = email;
      }
      if (category) {
        const legacyCategories = {
          infrastructure: ["infrastructure", "water", "electricity"],
          "public safety": ["public safety", "safety"],
          environment: ["environment"],
          sanitation: ["sanitation", "garbage", "waste"],
          transport: ["transport", "road"],
          construction: ["construction"],
        };
        query.category = { $in: legacyCategories[category] || [category] };
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

      // Pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Get total count
      const total = await issuesCollection.countDocuments(query);

      // Get paginated results
      const cursor = issuesCollection
        .find(query)
        .sort({ boosted: -1, createdAt: -1, resolvedAt: 1 })
        .skip(skip)
        .limit(limitNum);
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
    app.get("/issues/metrics", async (req, res) => {
      const cursor = issuesCollection.find();
      const result = await cursor.toArray();
      const metrics = issuesMetrics(result);

      // console.log("mat", metrics);
      res.send(metrics);
    });
    app.get("/issues/map", async (req, res) => {
      const category = req.query.category;
      const query = {};
      if (category && category !== "all") {
        const legacyCategories = {
          infrastructure: ["infrastructure", "road", "water", "electricity"],
          "public safety": ["public safety", "safety"],
          environment: ["environment"],
          sanitation: ["sanitation", "garbage", "waste"],
          transport: ["transport"],
          construction: ["construction"],
        };
        query.category = { $in: legacyCategories[category] || [category] };
      }
      const cursor = issuesCollection
        .find(query)
        .project({ title: 1, image: 1, category: 1, status: 1, priority: 1, location: 1, position: 1 })
        .limit(100)
        .sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.findOne(query);
      res.send(result);
    });

    app.post("/issues", verifyFBToken, async (req, res) => {
      const issue = req.body;
      issue.priority = "normal";
      issue.status = "pending";
      issue.createdAt = new Date();
      issue.updatedAt = new Date();
      issue.resolvedAt = null;
      issue.assignedStaff = null;
      issue.boosted = false;
      const result = await issuesCollection.insertOne(issue);

      // Decrement freeReport count for non-premium users
      if (issue.reporter) {
        const user = await usersCollection.findOne({ email: issue.reporter });
        if (user && !user.isPremium && user.freeReport > 0) {
          await usersCollection.updateOne({ email: issue.reporter }, { $inc: { freeReport: -1, reports: 1 } });
        }
      }

      res.send(result);
    });

    app.patch("/issues/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const updateInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!updateInfo.image) {
        updateInfo.image = issue.image;
      }

      if (updateInfo.status) {
        if (updateInfo.status === "resolved") {
          const staff = await staffsCollection.findOne({ email: issue.assignedStaff.email });
          staff.resolution;
          updateInfo.resolvedAt = new Date();
          // const { resolvedTasks, email } = (await staffsCollection.findOne({ email: issue.assignedStaff.email })) || {};
          // const update = { resolvedTasks: (resolvedTasks || 0) + 1 };
          const assignedAt = issue.staffAssignedAt;
          const requiredTime = assignedAt ? (updateInfo.resolvedAt - new Date(assignedAt)) / (1000 * 60 * 60 * 24) : 0;
          const avgDays =
            ((staff.resolvedTasks || 0) * (staff.averageDays || 0) + requiredTime) / ((staff.resolvedTasks || 0) + 1);
          await staffsCollection.updateOne(
            { email: issue.assignedStaff.email },
            { $inc: { resolvedTasks: 1 }, $set: { averageDays: Number(avgDays.toFixed(1)) } },
          );
          await usersCollection.updateOne({ email: issue.reporter }, { $inc: { solved: 1 } });
        }
        // add timelime activity to the issue
        const timelineInfo = {
          issueId: issue._id,
          message: `Issue status updated from ${issue.status} to ${updateInfo.status}`,
          updatedBy: `Staff: ${issue.assignedStaff.displayName}`,
        };
        await timelinesCollection.insertOne(timelineInfo);
      }

      updateInfo.updatedAt = new Date();
      const result = await issuesCollection.updateOne(query, { $set: updateInfo });
      res.send(result);
    });
    app.patch("/issues/admin/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const { status, staffEmail } = req.body;
      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);
      const updateInfo = {};
      try {
        if (staffEmail) {
          const staffInfo = await staffsCollection.findOne({ email: staffEmail });
          updateInfo.assignedStaff = {
            displayName: staffInfo.displayName,
            email: staffInfo.email,
            phone: staffInfo.phone,
          };
          // increase staff's assigned active task
          await staffsCollection.updateOne({ email: staffEmail }, { $inc: { activeTasks: 1 } });
          updateInfo.staffAssignedAt = new Date();
          // add timelime activity against issue
          const timelineInfo = {
            issueId: issue._id,
            message: `Issue assigned to Staff: ${staffInfo.displayName} : ${staffEmail}`,
            updatedBy: "Admin",
          };
          await timelinesCollection.insertOne(timelineInfo);
        }
        if (status && status === "rejected") {
          updateInfo.status = "rejected";

          // add timelime activity against issue
          const timelineInfo = {
            issueId: issue._id,
            message: "Issue rejected by Admin",
            updatedBy: "Admin",
          };
          await timelinesCollection.insertOne(timelineInfo);
        }
        const result = await issuesCollection.updateOne(query, { $set: updateInfo });
        res.send(result);
      } catch (err) {
        res.send({ err });
      }
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
      const allVotes = await upvotesCollection.find(idQuery).toArray();
      const myVote = await upvotesCollection.findOne(query);
      res.send({ allVotes, myVote });
    });
    app.post("/upvotes", async (req, res) => {
      const issue = req.body;
      const result = await upvotesCollection.insertOne(issue);
      res.send(result);
    });
    app.delete("/upvotes", async (req, res) => {
      const { email, issueId } = req.query;
      const query = {};
      if (email) {
        query.email = email;
      }
      if (issueId) {
        query.issueId = issueId;
      }
      const result = await upvotesCollection.deleteOne(query);
      res.send(result);
    });

    /*******************************/
    //     timeline related api
    /*******************************/
    app.get("/timelines", async (req, res) => {
      const { issueId } = req.query;
      const query = {};
      if (issueId) {
        query.issueId = issueId;
      }
      const options = { updatedAt: -1 };
      const result = await timelinesCollection.find(query).sort(options).toArray();
      res.send(result);
    });
    app.post("/timelines", async (req, res) => {
      const timelineInfo = req.body;
      const query = { _id: new ObjectId(timelineInfo.issueId) };
      const updatedIssue = await issuesCollection.findOne(query);
      timelineInfo.issueStatus = updatedIssue.status;
      timelineInfo.updatedAt = updatedIssue.updatedAt;
      const result = await timelinesCollection.insertOne(timelineInfo);
      res.send(result);
    });

    /*******************************/
    // payment related api for stripe
    /*******************************/

    app.post("/boost-payment-session", async (req, res) => {
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
    app.post("/subscription-payment-session", async (req, res) => {
      const userInfo = req.body;
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

    // Get payment session info from stripe
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

    /****************************************/
    //  payment related api for database store
    /*****************************************/
    // Post payment info to database
    app.post("/payments", async (req, res) => {
      try {
        const paymentInfo = req.body;
        paymentInfo.createdAt = new Date();

        // Derive payment purpose
        const md = paymentInfo.metadata || {};
        if (md.issueId) {
          paymentInfo.purpose = "Boost";
        } else if (md.userId) {
          paymentInfo.purpose = "Premium Subscription";
        } else {
          paymentInfo.purpose = "Unknown";
        }
        const query = { sessionId: paymentInfo.sessionId };
        const isPaymentDone = await paymentsCollection.findOne(query);
        if (!isPaymentDone) {
          const result = await paymentsCollection.insertOne(paymentInfo);
          // If this payment is a boost for an issue, update the issue priority
          try {
            const purposeLower = String(paymentInfo.purpose || "").toLowerCase();
            const issueId = paymentInfo.issueId || (paymentInfo.metadata && paymentInfo.metadata.issueId);
            if (purposeLower === "boost" || purposeLower === "Boost" || issueId) {
              if (issueId) {
                const query = { _id: new ObjectId(issueId) };
                const update = {
                  $set: { priority: "high", boosted: true, updatedAt: new Date() },
                };
                await issuesCollection.updateOne(query, update);
              }
            }
          } catch (err) {
            console.error("Error updating issue priority after payment:", err);
          }
          // If this payment is a subscription, update the user's premium status
          try {
            const purposeLower = String(paymentInfo.purpose || "").toLowerCase();
            const userId = paymentInfo.userId || (paymentInfo.metadata && paymentInfo.metadata.userId);
            if (userId || purposeLower.includes("subscription") || purposeLower === "premium subscription") {
              if (userId) {
                const userQuery = { _id: new ObjectId(userId) };
                const userUpdate = { $set: { isPremium: true, updatedAt: new Date() } };
                const res = await usersCollection.updateOne(userQuery, userUpdate);
              }
            }
          } catch (err) {
            console.error("Error updating user premium status after payment:", err);
          }
          res.send(result);
        }
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
          query.customerEmail = email;
        }
        // else {
        //   // Admin can filter by email if provided
        //   if (email) {
        //     query.customerEmail = emailFromToken;
        //   }
        // }

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
module.exports = app;
app.listen(port, () => {
  console.log(`The server is running on port ${port}`);
});
