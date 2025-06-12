const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;


app.use(cors());
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vnbrepr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        //collections
        const roomsCollection = client.db('hotel-server').collection('rooms');
        const bookingsCollection = client.db('hotel-server').collection('bookings');
        const reviewsCollection = client.db('hotel-server').collection('reviews');


        // GET /featured-rooms
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
                    $sort: {
                        averageRating: -1,
                        reviewCount: -1
                    }
                },
                { $limit: 6 }
            ]).toArray();
            const reviewedRoomIds = topReviewed.map(r => new ObjectId(r._id));
            const reviewedRooms = await roomsCollection.find({ _id: { $in: reviewedRoomIds } }).toArray();
            // Merge ratings into room objects
            const enrichedReviewed = topReviewed.map(r => {
                const room = reviewedRooms.find(room => room._id.toString() === r._id);
                return {
                    ...room,
                    averageRating: r.averageRating,
                    reviewCount: r.reviewCount
                };
            });
            // Fetch fallback rooms with no reviews
            const fallbackRooms = await roomsCollection.find({
                _id: { $nin: reviewedRoomIds }
            }).limit(6).toArray();
            const fallbackFormatted = fallbackRooms.map(room => ({
                ...room,
                averageRating: 0,
                reviewCount: 0
            }));
            // Combine and sort all, then take top 6
            const finalRooms = [...enrichedReviewed, ...fallbackFormatted]
                .sort((a, b) => {
                    const ratingDiff = b.averageRating - a.averageRating;
                    const reviewDiff = b.reviewCount - a.reviewCount;

                    return ratingDiff !== 0 ? ratingDiff : reviewDiff;
                })
                .slice(0, 6);

            res.send(finalRooms);
        });
        // Get all rooms OR rooms added by a specific user
        app.get('/rooms', async (req, res) => {
            const { email } = req.query;
            const filter = email ? { email } : {};
            const rooms = await roomsCollection.find(filter).toArray();
            res.send(rooms);
        });

        // Get a single room by ID
        app.get('/rooms/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await roomsCollection.findOne(query);
            res.send(result);
        });
        // Add a new room
        app.post('/rooms', async (req, res) => {
            const newRoom = req.body;
            console.log(newRoom);
            const result = await roomsCollection.insertOne(newRoom);
            res.send(result);
        });
        //delete a room by ID and related reviews/bookings
        app.delete('/rooms/:id', async (req, res) => {
            const roomId = req.params.id;
            // Delete the room
            const deleteRoomResult = await roomsCollection.deleteOne({ _id: new ObjectId(roomId) });
            // Delete related reviews
            const deleteReviewResult = await reviewsCollection.deleteMany({ roomId });
            // Delete related bookings
            const deleteBookingResult = await bookingsCollection.deleteMany({ roomId });
            res.send({
                deletedRoom: deleteRoomResult.deletedCount,
                deletedReviews: deleteReviewResult.deletedCount,
                deletedBookings: deleteBookingResult.deletedCount
            });
        });



        // Add booking
        app.post('/book-room', async (req, res) => {
            const { roomId, userEmail, date, ...otherBookingInfo } = req.body;
            // Check if the room is already booked for the same date
            const existingBooking = await bookingsCollection.findOne({ roomId, date: new Date(date) });
            if (existingBooking) {
                return res.status(400).send({ success: false, message: 'Room already booked for this date.' });
            }
            // If not booked, proceed to insert the booking
            const bookingResult = await bookingsCollection.insertOne({
                roomId,
                userEmail,
                date: new Date(date),
                ...otherBookingInfo
            });
            // Optionally update room availability flag (if applicable)
            await roomsCollection.updateOne(
                { _id: new ObjectId(roomId) },
                { $set: { available: false } }
            );
            res.send({ success: true, message: 'Room booked successfully.', bookingId: bookingResult.insertedId });
        });
        // Get all bookings for a specific user
        app.get('/my-bookings', async (req, res) => {
            const { userEmail } = req.query;
            if (!userEmail) {
                return res.status(400).send({ message: 'Missing userEmail' });
            }
            const bookings = await bookingsCollection.find({ userEmail }).toArray();
            res.send(bookings);
        });
        // Check if a room is already booked by a user
        app.get('/my-booking', async (req, res) => {
            const { roomId, userEmail } = req.query;
            if (!roomId || !userEmail) {
                return res.status(400).send({ success: false, message: 'Missing roomId or userEmail' });
            }
            const booking = await bookingsCollection.findOne({ roomId, userEmail });
            res.send({ alreadyBooked: !!booking });
        });
        // Cancel a booking
        app.delete('/cancel-booking/:id', async (req, res) => {
            const bookingId = req.params.id;
            const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });
            if (!booking) {
                return res.status(404).send({ success: false, message: 'Booking not found.' });
            }
            const deleteResult = await bookingsCollection.deleteOne({ _id: new ObjectId(bookingId) });
            // Make room available again
            await roomsCollection.updateOne(
                { _id: new ObjectId(booking.roomId) },
                { $set: { available: true } }
            );
            res.send({ success: true, message: 'Booking cancelled successfully.' });
        });
        // Update booking date
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


        // Get reviews by roomId
        app.get('/reviews', async (req, res) => {
            const roomId = req.query.roomId;
            const result = await reviewsCollection.find({ roomId }).toArray();
            res.send(result);
        });
        // Add a review with timestamp
        app.post('/reviews', async (req, res) => {
            const review = req.body;
            review.timestamp = new Date();
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });
        // Get latest reviews sorted by timestamp (for homepage)
        app.get('/latest-reviews', async (req, res) => {
            const latestReviews = await reviewsCollection
                .find()
                .sort({ timestamp: -1 })
                .limit(6)
                .toArray();
            res.send(latestReviews);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hotel Booking running')
})
app.listen(port, () => {
    console.log(`hotel booking server is running on port ${port}`);

})