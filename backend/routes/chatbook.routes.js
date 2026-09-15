import { Router } from 'express';
import { queryChatbook } from '../controllers/chatbook.controller.js';

const router = Router();

router.post('/chatbook/query', queryChatbook);

export default router;
