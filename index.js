import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors())
app.use(express.json())
const today = new Date().toISOString().split("T")[0]
