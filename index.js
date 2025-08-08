const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const moment = require('moment');

// const serviceAccount = require("./firebase-admin-key.json");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);



// Middleware
app.use(cors());
app.use(express.json());


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// Middleware to verify Firebase token
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
    }
    catch (error) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
};


// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vnbrepr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();

        //Collections
        const roomsCollection = client.db('hotel-server').collection('rooms');
        const bookingsCollection = client.db('hotel-server').collection('bookings');
        const reviewsCollection = client.db('hotel-server').collection('reviews');


        // ========== ROOMS APIs ==========
        // Get rooms added by a specific user
        app.get('/rooms/myAdded-rooms', verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const filter = email ? { email } : {};
            const rooms = await roomsCollection.find(filter).toArray();
            res.send(rooms);
        });
        // Get all rooms
        // app.get('/rooms', async (req, res) => {
        //     const rooms = await roomsCollection.find().toArray();
        //     res.send(rooms);
        // });
        //filter rooms by price range
        app.get('/rooms', async (req, res) => {
            const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
            const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;

            let filter = {};
            if (minPrice !== null && maxPrice !== null) {
                filter.price = { $gte: minPrice, $lte: maxPrice };
            }

            const rooms = await roomsCollection.find(filter).toArray();
            res.json(rooms);
        });
        // Get a single room by ID
        app.get('/rooms/:id', async (req, res) => {
            const id = req.params.id;
            const result = await roomsCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });
        // Add a new room & verifyFirebaseToken
        app.post('/rooms', verifyFirebaseToken, async (req, res) => {
            const room = req.body;
            // Ensure the user is only adding rooms for their own email
            if (room.email !== req.decoded.email) {
                return res.status(403).json({ message: 'Forbidden access' });
            }
            const result = await roomsCollection.insertOne(room);
            res.json({ success: true, insertedId: result.insertedId });
        });
        // delete a my added room
        app.delete('/rooms/:id', async (req, res) => {
            const roomId = req.params.id;

            const deleteRoomResult = await roomsCollection.deleteOne({ _id: new ObjectId(roomId) });
            const deleteReviewResult = await reviewsCollection.deleteMany({ roomId });
            const deleteBookingResult = await bookingsCollection.deleteMany({ roomId });

            res.send({
                deletedRoom: deleteRoomResult.deletedCount,
                deletedReviews: deleteReviewResult.deletedCount,
                deletedBookings: deleteBookingResult.deletedCount
            });
        });



        // ========== FEATURED ROOMS ==========
        //only rating
        app.get('/featured-rooms', async (req, res) => {

            const topReviewed = await reviewsCollection.aggregate([
                {
                    $group: {
                        _id: "$roomId",
                        averageRating: { $avg: "$rating" },
                        reviewCount: { $sum: 1 }
                    }
                },
                {
                    $sort: { averageRating: -1, reviewCount: -1 }
                },
                { $limit: 6 }
            ]).toArray();

            const reviewedRoomIds = topReviewed.map(r => new ObjectId(r._id));
            const reviewedRooms = await roomsCollection.find({ _id: { $in: reviewedRoomIds } }).toArray();

            const enrichedReviewed = topReviewed.map(r => {
                const room = reviewedRooms.find(room => room._id.toString() === r._id);
                return {
                    ...room,
                    averageRating: r.averageRating,
                    reviewCount: r.reviewCount
                };
            });

            const fallbackRooms = await roomsCollection.find({ _id: { $nin: reviewedRoomIds } }).limit(6).toArray();
            const fallbackFormatted = fallbackRooms.map(room => ({
                ...room,
                averageRating: 0,
                reviewCount: 0
            }));

            const finalRooms = [...enrichedReviewed, ...fallbackFormatted]
                .sort((a, b) => {
                    const ratingDiff = b.averageRating - a.averageRating;
                    const reviewDiff = b.reviewCount - a.reviewCount;
                    return ratingDiff !== 0 ? ratingDiff : reviewDiff;
                })
                .slice(0, 6);

            res.send(finalRooms);
        });



        // ========== BOOKINGS ==========

        //my booking
        app.get('/my-bookings', verifyFirebaseToken, async (req, res) => {
            const { userEmail } = req.query;

            if (userEmail !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const bookings = await bookingsCollection.find({ userEmail }).toArray();
            res.send(bookings);
        });

        app.post('/book-room', async (req, res) => {
            const booking = req.body;
            const { roomId } = booking;
            const isBooked = await bookingsCollection.findOne({ roomId });
            if (isBooked) {
                return res.status(400).send({ success: false, message: 'Room already booked' });
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send({ success: true, result });
        });
        // Check if a room is already booked
        app.get('/already-booking', async (req, res) => {
            const { roomId } = req.query;
            if (!roomId) {
                return res.status(400).json({
                    success: false,
                    message: 'roomId is required'
                });
            }
            const booking = await bookingsCollection.findOne({ roomId });
            res.json({
                success: true,
                alreadyBooked: !!booking
            });
        });

        app.patch('/update-booking/:id', async (req, res) => {
            const bookingId = req.params.id;
            const { date } = req.body;

            const result = await bookingsCollection.updateOne(
                { _id: new ObjectId(bookingId) },
                { $set: { date: new Date(date) } }
            );

            if (result.modifiedCount > 0) {
                res.send({ success: true, message: 'Booking date updated successfully.' });
            } else {
                res.send({ success: false, message: 'No changes made or booking not found.' });
            }
        });

        app.delete('/cancel-booking/:id', async (req, res) => {
            const bookingId = req.params.id;
            const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });

            if (!booking) {
                return res.status(404).send({ success: false, message: 'Booking not found.' });
            }

            const bookingDate = moment(booking.date);
            const today = moment().startOf('day');
            const cancelDeadline = bookingDate.clone().subtract(1, 'days');
            // Prevent cancel if it's already 1 day or less before the booking date
            if (!today.isBefore(cancelDeadline)) {
                return res.status(400).send({
                    success: false,
                    message: 'Cancellation period has Expired. You can only cancel 1 day before the booking date.'
                });
            }
            const deleteResult = await bookingsCollection.deleteOne({ _id: new ObjectId(bookingId) });

            await roomsCollection.updateOne(
                { _id: new ObjectId(booking.roomId) },
                { $set: { available: true } }
            );
            res.send({ success: true, message: 'Booking cancelled successfully.' });
        });

        // Backend auto-cancel book date
        // cron.schedule('0 0 * * *', async () => {
        //     const today = new Date();
        //     today.setHours(0, 0, 0, 0);
        //     const expiredBookings = await bookingsCollection.find({
        //         date: { $lt: today }
        //     }).toArray();
        //     for (const booking of expiredBookings) {
        //         await bookingsCollection.deleteOne({ _id: booking._id });
        //         await roomsCollection.updateOne(
        //             { _id: new ObjectId(booking.roomId) },
        //             { $set: { available: true } }
        //         );
        //     }
        // });



        // ========== REVIEWS ==========

        // app.get('/reviews', async (req, res) => {
        //     const roomId = req.query.roomId;
        //     const result = await reviewsCollection.find({ roomId }).toArray();
        //     res.send(result);
        // });

        app.get('/latest-reviews', async (req, res) => {
            const latestReviews = await reviewsCollection
                .find()
                .sort({ timestamp: -1 })
                .toArray();
            res.send(latestReviews);
        });

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            review.timestamp = new Date();
            review.userEmail = req.body.userEmail;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

        // GET - Get reviews for a specific room
        app.get('/reviews', async (req, res) => {
            try {
                const { roomId } = req.query;

                if (!roomId) {
                    return res.status(400).json({
                        success: false,
                        message: 'roomId is required'
                    });
                }

                const reviews = await reviewsCollection
                    .find({ roomId })
                    .sort({ timestamp: -1 })  // Newest first
                    .toArray();

                res.json({
                    success: true,
                    reviews
                });

            } catch (error) {
                console.error('Error fetching reviews:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to fetch reviews'
                });
            }
        });

        // PATCH - Update a review
        app.patch('/reviews/:id', verifyFirebaseToken, async (req, res) => {
            try {
                const reviewId = req.params.id;
                const { comment, rating } = req.body;
                const userEmail = req.decoded.email; // Get from verified token

                // Validate input
                if (!comment && !rating) {
                    return res.status(400).json({
                        success: false,
                        message: 'Nothing to update'
                    });
                }

                const updateData = {
                    timestamp: new Date()
                };

                if (comment) updateData.comment = comment;
                if (rating) {
                    if (rating < 1 || rating > 5) {
                        return res.status(400).json({
                            success: false,
                            message: 'Rating must be between 1 and 5'
                        });
                    }
                    updateData.rating = Number(rating);
                }

                const result = await reviewsCollection.updateOne(
                    {
                        _id: new ObjectId(reviewId),
                        userEmail: userEmail  // Ensure user owns the review
                    },
                    { $set: updateData }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Review not found or not owned by user'
                    });
                }

                res.json({
                    success: true,
                    message: 'Review updated successfully'
                });

            } catch (error) {
                console.error('Error updating review:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to update review'
                });
            }
        });

        // DELETE - Delete a review
        app.delete('/reviews/:id', verifyFirebaseToken, async (req, res) => {
            try {
                const reviewId = req.params.id;
                const userEmail = req.decoded.email; // Get from verified token

                const result = await reviewsCollection.deleteOne({
                    _id: new ObjectId(reviewId),
                    userEmail: userEmail  // Ensure user owns the review
                });

                if (result.deletedCount === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Review not found or not owned by user'
                    });
                }

                res.json({
                    success: true,
                    message: 'Review deleted successfully'
                });

            } catch (error) {
                console.error('Error deleting review:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to delete review'
                });
            }
        });


        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hotel Booking running by silkCity');
});

app.listen(port, () => {
    console.log(`Hotel booking server is running on port ${port}`);
});
