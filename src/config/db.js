// const mongoose = require('mongoose');

// async function connectDb() {
//   const uri = process.env.MONGODB_URI;
//   if (!uri) {
//     throw new Error('MONGODB_URI is required');
//   }
//   mongoose.set('strictQuery', true);
//   await mongoose.connect(uri);
//   // eslint-disable-next-line no-console
//   console.log('MongoDB connected');
// }

// module.exports = { connectDb };

const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDb() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, opts)
      .then((mongoose) => {
        // eslint-disable-next-line no-console
        console.log("MongoDB connected");
        return mongoose;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = { connectDb };
