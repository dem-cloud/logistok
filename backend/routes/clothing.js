// clothing.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');

const supabase = require('../supabaseConfig');

// Routes
router.get('/clothes', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('c_clothes')
            .select('*')
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.get('/clothing_barcodes', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('c_clothing_barcodes')
            .select('*')
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});


router.get('/clothing/:clothingBarcode', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { clothingBarcode } = req.params;

    try {
        // Fetch clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('c_clothes')
            .select('*')
            .eq('barcode', clothingBarcode)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.post('/clothing', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const newClothing = req.body;

        // Insert the new clothing data into the Supabase 'clothes' table
        const { data, error } = await supabase
            .from('c_clothes')
            .insert([{
                barcode: newClothing.barcode,
                clothing: newClothing.clothing,
                quantity: newClothing.quantity,
                size: newClothing.size,
                color: newClothing.color,
                price: newClothing.price,
                storage: newClothing.storage,
                comments: newClothing.comments,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/clothing/:clothingBarcode', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { clothingBarcode } = req.params;
        const { clothing, quantity, size, color, price, storage, comments } = req.body;

        const { data, error } = await supabase
            .from('c_clothes')
            .update({
                clothing,
                quantity,
                size,
                color,
                price,
                storage,
                comments
            })
            .eq('barcode', clothingBarcode) // Use eq to specify the condition
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });

    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
});
router.put('/clothing_quantity/:clothingId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { clothingId } = req.params;
        const { availableQuantity } = req.body;

        const { data, error } = await supabase
            .from('c_clothes')
            .update({
                quantity: availableQuantity
            })
            .eq('id', clothingId) // Use eq to specify the condition
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });

    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
});
router.delete('/clothing/:clothingBarcode', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { clothingBarcode } = req.params;

        const { data, error } = await supabase
            .from('c_clothes')
            .delete()
            .eq('barcode', clothingBarcode) // Use eq to specify the condition
            .eq('subscription_id', subscription_id);

        if (error) {
            // Handle the error if the deletion fails
            if (error.message.includes('foreign key constraint')) {
                return res.status(400).json({ error: 'Αδυναμία διαγραφής, το στοιχείο χρησιμοποιείται αλλού.' });
            }
            return res.status(500).json({ error: 'Σφάλμα κατά την διαγραφή στοιχείου' });
        }

        res.json({ message: 'Επιτυχής διαγραφή στοιχείου' });
        
    } catch (error) {
        console.error('Σφάλμα κατά την διαγραφή στοιχείου:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την διαγραφή στοιχείου' });
    }
});

router.get('/reservations', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('c_reservations_with_clothes')
            .select('*')
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.get('/reservation/:reservationId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { reservationId } = req.params;

    try {
        // Fetch clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('c_reservations_with_clothes')
            .select('*')
            .eq('reservation_id', reservationId) // Filter by reservation_id
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.post('/reservation', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    try {
        const newReservation = req.body;

        const { data, error } = await supabase
            .from('c_reservations')
            .insert([{
                appointment_datetime: newReservation.appointmentDatetime,
                quantity_reserved: newReservation.quantityReserved,
                status: newReservation.status,
                reservation_comments: newReservation.reservationComments,
                deposit: newReservation.deposit,
                agreed_upon_price: newReservation.agreedUponPrice,
                clothing_id: newReservation.clothingId,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/reservation/:reservationId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { reservationId } = req.params;
        const { deposit, agreed_upon_price, appointment_datetime, quantity_reserved, reservation_comments } = req.body;

        const { data, error } = await supabase
            .from('c_reservations')
            .update({
                deposit,
                agreed_upon_price,
                appointment_datetime,
                quantity_reserved,
                reservation_comments,
            })
            .eq('id', reservationId) // Use eq to specify the condition
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });

    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
});
router.put('/reservation_status/:reservationId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { reservationId } = req.params;
        const { status } = req.body;

        const { data, error } = await supabase
            .from('c_reservations')
            .update({
                status
            })
            .eq('id', reservationId) // Use eq to specify the condition
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });

    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
});
router.delete('/reservation/:reservationId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { reservationId } = req.params;

        const { error } = await supabase
            .from('c_reservations')
            .delete()
            .eq('id', reservationId)
            .eq('subscription_id', subscription_id);

        // Handle errors if the deletion fails
        if (error) {
            // If the error is related to a foreign key constraint violation
            if (error.message.includes('foreign key constraint')) {
                return res.status(400).json({
                    error: 'Αδυναμία διαγραφής, το στοιχείο χρησιμοποιείται αλλού.'
                });
            }
            return res.status(500).json({ error: 'Σφάλμα κατά την διαγραφή στοιχείου' });
        }

        res.json({ message: 'Επιτυχής διαγραφή στοιχείου' });

    } catch (error) {
        // Handle any other unexpected errors
        console.error('Σφάλμα κατά την διαγραφή στοιχείου:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την διαγραφή στοιχείου' });
    }
});


router.get('/sales', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { start_date, end_date } = req.query;

        // Building a dynamic query based on whether dates are provided
        let query = supabase
            .from('c_sales_with_clothes')
            .select('*')
            .eq('subscription_id', subscription_id);

        if (start_date) {
            query = query.gte('sold_at', start_date);
        }

        if (end_date) {
            query = query.lte('sold_at', end_date);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
})

router.get('/sale/:saleId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { saleId } = req.params;

    try {
        // Fetch clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('c_sales_with_clothes')
            .select('*')
            .eq('sale_id', saleId)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.post('/sale', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const newSale = req.body;

        const { data, error } = await supabase
            .from('c_sales')
            .insert([{
                sale_price: newSale.salePrice,
                quantity_sold: newSale.quantitySold,
                sale_comments: newSale.saleComments,
                clothing_id: newSale.clothingId,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/sale/:saleId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { saleId } = req.params;
        const { sale_price, quantity_sold, sale_comments } = req.body;

        const { data, error } = await supabase
            .from('c_sales')
            .update({
                sale_price,
                quantity_sold,
                sale_comments
            })
            .eq('sale_id', saleId) // Use eq to specify the condition
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });

    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
});
router.delete('/sale/:saleId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { saleId } = req.params;

        const { error } = await supabase
            .from('c_sales')
            .delete()
            .eq('sale_id', saleId)
            .eq('subscription_id', subscription_id);

        // Handle errors if the deletion fails
        if (error) {
            // If the error is related to a foreign key constraint violation
            if (error.message.includes('foreign key constraint')) {
                return res.status(400).json({
                    error: 'Αδυναμία διαγραφής, το στοιχείο χρησιμοποιείται αλλού.'
                });
            }
            return res.status(500).json({ error: 'Σφάλμα κατά την διαγραφή στοιχείου' });
        }

        res.json({ message: 'Επιτυχής διαγραφή στοιχείου' });

    } catch (error) {
        // Handle any other unexpected errors
        console.error('Σφάλμα κατά την διαγραφή στοιχείου:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την διαγραφή στοιχείου' });
    }
});

module.exports = router;