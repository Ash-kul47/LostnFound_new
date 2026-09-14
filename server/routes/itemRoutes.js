const express = require("express");
const router = express.Router();

const Item = require("../models/Item");
const authMiddleware =require("../middleware/authMiddleware");

const uploadToCloudinary =require("../utils/uploadToCloudinary");

const upload =require("../middleware/uploadMiddleware");
const Notification = require("../models/Notification");
const { generateTextEmbedding } = require("../utils/generateEmbedding");
const { generateImageTags } = require("../utils/generateImageTags");


/**
 * @swagger
 * /api/items:
 *   post:
 *     summary: Report a lost or found item
 *     tags:
 *       - Items
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - type
 *               - category
 *               - location
 *               - dateLostFound
 *             properties:
 *               title:
 *                 type: string
 *                 example: Black Wallet
 *               description:
 *                 type: string
 *                 example: Lost near library.
 *               type:
 *                 type: string
 *                 enum: [LOST, FOUND]
 *               category:
 *                 type: string
 *                 enum: [ELECTRONICS, KEYS, WALLET, DOCUMENTS, BAGS, ID_CARD, BOOKS, CLOTHING, OTHERS]
 *               location:
 *                 type: string
 *                 example: Central Library
 *               dateLostFound:
 *                 type: string
 *                 format: date
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Item reported successfully
 *       400:
 *         description: Invalid data
 *       401:
 *         description: Unauthorized
 */
router.post("/",authMiddleware,upload.single("image"),async(req,res)=>{
    try{
        const{title,description,type,category,location,dateLostFound}=req.body;
        
        let imageUrls = [];

        if (req.file) {

            const uploadedImage =
            await uploadToCloudinary(
            req.file.buffer
        );

        imageUrls.push(
        uploadedImage.secure_url
    );

    }

        const item=await Item.create({
            title,
            description,
            type,
            category,
            location,
            dateLostFound,
            images:imageUrls,


            reportedBy:req.user.id
        });
        await Notification.create({

            user:req.user.id,

            title:"Item Reported",

            message:`Your ${type} item "${title}" has been reported successfully.`

        });
        res.status(201).json({
            message:"Item Created Successfully",

            item
        });

        // ── AI Embedding Hook (non-blocking, fires AFTER response is sent) ────
        // If Gemini is not configured, gracefully skip and mark SKIPPED.
        setImmediate(async () => {
            try {
                const textInput = `${title} ${description} ${category || ""} ${location}`.trim();
                const [textEmbedding, autoTags] = await Promise.all([
                    generateTextEmbedding(textInput),
                    imageUrls.length > 0 ? generateImageTags(imageUrls[0]) : Promise.resolve([])
                ]);
                await Item.findByIdAndUpdate(item._id, {
                    textEmbedding,
                    autoTags,
                    embeddingStatus: "DONE"
                });
                console.log(`[AI] Embeddings generated for item ${item._id} | tags: [${autoTags.join(", ")}]`);
            } catch (aiErr) {
                const isNotConfigured = aiErr.message && aiErr.message.includes("GEMINI_API_KEY");
                const newStatus = isNotConfigured ? "SKIPPED" : "FAILED";
                await Item.findByIdAndUpdate(item._id, { embeddingStatus: newStatus }).catch(() => {});
                if (!isNotConfigured) {
                    console.error(`[AI] Embedding failed for item ${item._id}:`, aiErr.message);
                }
            }
        });
        
    }catch(error){

            console.log(error);

            res.status(500).json({
                message:"Server Error"
            });
        }
    }
);


/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Get all reported items
 *     tags:
 *       - Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of items
 */
router.get("/", authMiddleware, async (req, res) => {

    try {

        const {
            search,
            type,
            category,
            location,
            status,
            page = 1,
            limit = 10
        } = req.query;

        const query = {};

        if (search) {
            query.title = {
                $regex: search,
                $options: "i"
            };
        }

        if (type) {
            query.type = type;
        }

        if (category) {
            query.category = category;
        }

        if (location) {
            query.location = {
                $regex: location,
                $options: "i"
            };
        }

        if (status) {
            query.status = status;
        }

        const items = await Item.find(query)
            .populate(
                "reportedBy",
                "name email department year"
            )
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const totalItems = await Item.countDocuments(query);

        res.status(200).json({

            totalItems,

            currentPage: Number(page),

            totalPages: Math.ceil(totalItems / limit),

            items

        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

// ── GET /api/items/my ─────────────────────────────────────────────────────
// Returns every item reported by the logged-in user for dashboard workflows.
router.get("/my", authMiddleware, async (req, res) => {

    try {

        const items = await Item.find({
            reportedBy: req.user.id
        })
        .populate(
            "reportedBy",
            "name email department year"
        )
        .sort({ createdAt: -1 });

        res.status(200).json({
            count: items.length,
            items
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

router.get("/search", async(req,res)=>{

    try{

        const { keyword = "", page = 1, limit = 10 } = req.query;

        const query = keyword ? {
            $or: [
                { title: { $regex: keyword, $options: "i" } },
                { description: { $regex: keyword, $options: "i" } }
            ]
        } : {};

        const items = await Item.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const totalItems = await Item.countDocuments(query);

        res.status(200).json({
            totalItems,
            currentPage: Number(page),
            totalPages: Math.ceil(totalItems / limit),
            items
        });

    }
    catch(error){

        console.log(error);

        res.status(500).json({
            message:"Server Error"
        });

    }

});
/**
 * @swagger
 * /api/items/{id}:
 *   get:
 *     summary: Get a single item by ID
 *     tags:
 *       - Items
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item details
 *       404:
 *         description: Item not found
 */
router.get("/:id",async(req,res)=>{
    try{
        const item=await Item.findById(req.params.id).populate(
            "reportedBy",
            "name email"
        );
        if(!item){
            return res.status(404).json({
                message:"Item not found"
            });
        }
        res.status(200).json(item);
    }catch(error){
        console.log(error);
        res.status(500).json({
            message:"server error"
        });
    }
})
/**
 * @swagger
 * /api/items/{id}:
 *   put:
 *     summary: Update an existing item
 *     tags:
 *       - Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item updated successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Item not found
 */
router.put("/:id",authMiddleware,async(req,res)=>{
    try{
        const item=await Item.findById(req.params.id);

        if(!item){
            return res.status(404).json({
                message:"Item Not Found"
            });
        }
        if(item.reportedBy.toString()!==req.user.id && !["ADMIN", "SUPER_ADMIN"].includes(req.user.role)){
        return res.status(403).json({
            message:"Not Authorized"
        });
    }
    const updatedItem =
    await Item.findByIdAndUpdate(

        req.params.id,

        req.body,

        {
            new:true,
            runValidators:true
        }

    );
    res.status(200).json({

    message:
        "Item Updated Successfully",

    updatedItem

});
    }catch(error){
        console.log(error);
        res.status(500).json({
            message:"Server Error"
        });
    }
    
})
/**
 * @swagger
 * /api/items/{id}/matches:
 *   get:
 *     summary: Find matching lost/found items
 *     tags:
 *       - Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Matching items with match score
 *       404:
 *         description: Item not found
 */
router.get("/:id/matches", authMiddleware, async (req, res) => {

    try {

        // Fetch the source item — also pull textEmbedding for AI matching
        const item = await Item.findById(req.params.id).select("+textEmbedding");

        if (!item) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        const oppositeType = item.type === "LOST" ? "FOUND" : "LOST";

        // Date Range window for candidate retrieval (±14 days — wider net for AI)
        const startDate = new Date(item.dateLostFound);
        startDate.setDate(startDate.getDate() - 14);
        const endDate = new Date(item.dateLostFound);
        endDate.setDate(endDate.getDate() + 14);

        const hasEmbedding = Array.isArray(item.textEmbedding) && item.textEmbedding.length === 768;

        // ── Helper: cosine similarity between two float arrays ────────────
        function cosineSimilarity(a, b) {
            if (!a || !b || a.length !== b.length) return 0;
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < a.length; i++) {
                dot += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
            }
            const denom = Math.sqrt(normA) * Math.sqrt(normB);
            return denom === 0 ? 0 : dot / denom;
        }

        // ── Helper: tag overlap ratio ─────────────────────────────────────
        function tagOverlapScore(tagsA, tagsB) {
            if (!tagsA || !tagsB || tagsA.length === 0 || tagsB.length === 0) return 0;
            const setA = new Set(tagsA.map(t => t.toLowerCase()));
            const common = tagsB.filter(t => setA.has(t.toLowerCase())).length;
            return common / Math.max(tagsA.length, tagsB.length);
        }

        // ── Helper: rule-based proximity score (0–100) ────────────────────
        function proximityScore(source, candidate) {
            let score = 0;
            if (source.category && candidate.category === source.category) score += 20;
            if (source.location && candidate.location === source.location) score += 20;
            const daysDiff = Math.abs(
                (new Date(candidate.dateLostFound) - new Date(source.dateLostFound))
                / (1000 * 60 * 60 * 24)
            );
            score += Math.max(0, 20 - daysDiff * 1.5);
            // Title word overlap
            const srcWords = source.title.toLowerCase().split(/\s+/);
            const candWords = candidate.title.toLowerCase().split(/\s+/);
            const common = srcWords.filter(w => candWords.includes(w) && w.length > 2).length;
            score += Math.min(common * 10, 40);
            return Math.min(score, 100);
        }

        let scoredMatches = [];
        let matchMode = "rule-based";

        if (hasEmbedding) {
            // ── AI PATH: fetch candidates with their embeddings ───────────
            matchMode = "ai-semantic";
            const candidates = await Item.find({
                _id: { $ne: item._id },
                type: oppositeType,
                status: "OPEN",
                dateLostFound: { $gte: startDate, $lte: endDate }
            })
            .select("+textEmbedding")
            .populate("reportedBy", "name email department year")
            .limit(100);  // cap to avoid performance issues

            scoredMatches = candidates.map(candidate => {
                const textSim = cosineSimilarity(item.textEmbedding, candidate.textEmbedding);
                const tagSim  = tagOverlapScore(item.autoTags, candidate.autoTags);
                const proxSim = proximityScore(item, candidate) / 100;

                // Composite: 50% text semantics + 20% tag vision + 30% proximity
                const compositeScore = (textSim * 0.50) + (tagSim * 0.20) + (proxSim * 0.30);
                const matchScore = Math.round(Math.min(compositeScore * 100, 100));

                return {
                    ...candidate.toObject(),
                    matchScore,
                    textSimilarity: Math.round(textSim * 100),
                    tagSimilarity: Math.round(tagSim * 100),
                    proximityScore: Math.round(proxSim * 100),
                    matchMode: "ai-semantic"
                };
            }).filter(m => m.matchScore >= 20); // Only meaningful matches

        } else {
            // ── FALLBACK PATH: original rule-based (for items without embeddings) ──
            const candidates = await Item.find({
                _id: { $ne: item._id },
                type: oppositeType,
                category: item.category,
                location: item.location,
                dateLostFound: { $gte: startDate, $lte: endDate },
                status: "OPEN"
            }).populate("reportedBy", "name email department year");

            scoredMatches = candidates.map(candidate => ({
                ...candidate.toObject(),
                matchScore: Math.round(Math.min(proximityScore(item, candidate), 100)),
                matchMode: "rule-based"
            }));
        }

        scoredMatches.sort((a, b) => b.matchScore - a.matchScore);

        res.status(200).json({
            count: scoredMatches.length,
            matchMode,
            embeddingStatus: item.embeddingStatus,
            matches: scoredMatches
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Delete an item
 *     tags:
 *       - Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Item not found
 */
router.delete(
    "/:id",
    authMiddleware,

    async(req,res)=>{

        try{

            const item =
                await Item.findById(
                    req.params.id
                );

            if(!item){

                return res.status(404).json({
                    message:"Item not found"
                });

            }

            if(
                item.reportedBy.toString() !== req.user.id
                &&
                !["ADMIN", "SUPER_ADMIN"].includes(req.user.role)
            ){

                return res.status(403).json({
                    message:"Not Authorized"
                });

            }

            await Item.findByIdAndDelete(
                req.params.id
            );

            res.status(200).json({

                message:
                    "Item Deleted Successfully"

            });

        }
        catch(error){

            console.log(error);

            res.status(500).json({
                message:"Server Error"
            });

        }

    }
);

module.exports = router;
