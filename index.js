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


        app.get('/rooms', async (req, res) => {
            const cursor = roomsCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });
        app.get('/rooms/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await roomsCollection.findOne(query);
            res.send(result);
        });
        app.post('/rooms', async (req, res) => {
            const newRoom = req.body;
            console.log(newRoom);
            const result = await roomsCollection.insertOne(newRoom);
            res.send(result);
        })




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
                { $set: { available: false } } // You can remove this if date-based availability is used
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
            try {
                const result = await bookingsCollection.updateOne(
                    { _id: new ObjectId(bookingId) },
                    { $set: { date: new Date(date) } }
                );
                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Booking date updated successfully.' });
                } else {
                    res.send({ success: false, message: 'No changes made or booking not found.' });
                }
            } catch (error) {
                console.error('Update booking error:', error);
                res.status(500).send({ success: false, message: 'Server error.' });
            }
        });


        // Get reviews by roomId
        app.get('/reviews', async (req, res) => {
            const roomId = req.query.roomId;
            const result = await reviewsCollection.find({ roomId }).toArray();
            res.send(result);
        });
        // Add a review
        app.post('/reviews', async (req, res) => {
            const review = req.body; // expects { roomId, user, comment }
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
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