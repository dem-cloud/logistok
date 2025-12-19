// construction.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authRequired');

const supabase = require('../supabaseConfig');

// ## Routes ##
// Sizes
router.get('/sizes', authenticateToken, async (req, res) => {
    
    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_sizes')
            .select('*')

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

// Material Categories
router.get('/categories', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_material_categories')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

router.post('/categories', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { categoryName } = req.body;

        const { data, error } = await supabase
            .from('cy_material_categories')
            .insert([{
                name: categoryName,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/categories/:categoryId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { categoryId } = req.params;
        const { categoryName } = req.body;

        const { data, error } = await supabase
            .from('cy_material_categories')
            .update({
                name: categoryName
            })
            .eq('id', categoryId) 
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})


// Materials
router.get('/materials', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_materials')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

router.post('/materials', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { 
            name,
            description,
            category
        } = req.body;

        const { data, error } = await supabase
            .from('cy_materials')
            .insert([{
                name,
                description,
                category_id: category,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/materials/:materialId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { materialId } = req.params;
        const {
            name,
            description,
            category
         } = req.body;

        const { data, error } = await supabase
            .from('cy_materials')
            .update({
                name,
                description,
                category_id: category
            })
            .eq('id', materialId)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})


// Materials and Sizes Relations
router.get('/relations', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_materials_with_sizes')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('material_size_id', { ascending: true });

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

router.get('/search-relations', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;
    const { query } = req.query;

    if (!query) {
        return res.json([]);
    }

    try {
        const { data: relations, error: relationError  } = await supabase
            .from('cy_materials_with_sizes')
            .select('*')
            .or(
                `material_name.ilike.%${query}%,description.ilike.%${query}%,size_name.ilike.%${query}%`
            )
            .limit(5)
            .eq('subscription_id', subscription_id);

        if (relationError) {
            throw relationError;
        }

        res.json(relations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.post('/relations', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { 
            materialId,
            sizeId,
            quantity,
            price
        } = req.body;

        const { data, error } = await supabase
            .from('cy_materials_and_sizes')
            .insert([{
                material_id: materialId,
                size_id: sizeId,
                quantity,
                price,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/relations/:relationlId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { relationlId } = req.params;
        const {
            materialId,
            sizeId,
            quantity,
            price
         } = req.body;

        const { data, error } = await supabase
            .from('cy_materials_and_sizes')
            .update({
                material_id: materialId,
                size_id: sizeId,
                quantity,
                price
            })
            .eq('id', relationlId)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})

// Customers
router.get('/customers', authenticateToken, async (req, res) => {
    const { subscription_id } = req.user;
    try {
        const { page = 1, limit = 10 } = req.query; // Default values for page and limit
        const offset = (page - 1) * limit;

        // Fetch customers with their first address and last order datetime
        const { data: customers, count, error } = await supabase
            .from('cy_customers')
            .select(`
                *,
                cy_addresses (
                    street_address,
                    area
                ),
                cy_orders (
                    created_at
                )
            `, { count: 'exact' })
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: false })
            .range(offset, offset + limit - 1); // Get customers for the current page;

        if (error) {
            throw error;
        }

        // Process the data (customers) to get the first address and last order datetime
        const processedData = customers.map(customer => ({
            ...customer,
            first_address: customer.cy_addresses.length > 0 
                ? {
                    street_address: customer.cy_addresses[0].street_address,
                    area: customer.cy_addresses[0].area
                }
                : null,
            last_order: customer.cy_orders.length > 0
                ? customer.cy_orders.reduce((latest, current) => 
                    new Date(current.created_at) > new Date(latest.created_at) 
                    ? current 
                    : latest
                ).created_at
                : null,
            orders_length: customer.cy_orders.length
        }));

        // Remove nested arrays to clean up the response
        processedData.forEach(customer => {
            delete customer.cy_addresses;
            delete customer.cy_orders;
        });

        const totalPages = count === 0 ? 1 : Math.ceil(count / limit);

        res.json({
            processedData,
            totalPages,
            totalCustomers: count, // Return the total number of customers for better context
        });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers.' });
    }
});

router.get('/customer/:customerId', authenticateToken, async (req, res) => {
    const { subscription_id } = req.user;
    const { customerId } = req.params;

    try {
        // First, verify the customer
        const { data: customerData, error: customerError } = await supabase
            .from('cy_customers')
            .select('*')
            .eq('id', customerId)
            .eq('subscription_id', subscription_id)
            .single();

        if (customerError) {
            console.error('Customer Query Error:', customerError);
            return res.status(500).json({ error: 'Failed to retrieve customer' });
        }

        if (!customerData) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Then fetch addresses
        const { data: addressesData, error: addressesError } = await supabase
            .from('cy_addresses')
            .select('*')
            .eq('customer_id', customerId)
            .eq('subscription_id', subscription_id);

        if (addressesError) {
            console.error('Addresses Query Error:', addressesError);
            return res.status(500).json({ error: 'Failed to retrieve addresses' });
        }

        // Then fetch partnerships
        const { data: partnershipsData, error: partnershipsError } = await supabase
            .from('cy_partnerships')
            .select('*')
            .or(
                `customer_1_id.eq.${customerId},customer_2_id.eq.${customerId}`
            )
            .eq('subscription_id', subscription_id);

        if (partnershipsError) {
            console.error('Partnerships Query Error:', partnershipsError);
            return res.status(500).json({ error: 'Failed to retrieve partnerships' });
        }

        // Fetch partner details
        let partnersData = [];
        if (partnershipsData.length > 0) {
            // Extract partner IDs
            const partnerIds = partnershipsData.map(partnership => 
                partnership.customer_1_id === parseInt(customerId) 
                    ? partnership.customer_2_id 
                    : partnership.customer_1_id
            );

            // Fetch partner details
            const { data: fetchedPartnersData, error: partnersError } = await supabase
                .from('cy_customers')
                .select('id, name, profession')
                .in('id', partnerIds)
                .eq('subscription_id', subscription_id);

            if (partnersError) {
                console.error('Partners Query Error:', partnersError);
                return res.status(500).json({ error: 'Failed to retrieve partner details' });
            }

            partnersData = fetchedPartnersData;
        }

        // Then fetch orders
        const { data: ordersData, error: ordersError } = await supabase
            .from('cy_orders')
            .select('*')
            .eq('customer_id', customerId)
            .eq('subscription_id', subscription_id);

        if (ordersError) {
            console.error('Orders Query Error:', ordersError);
            return res.status(500).json({ error: 'Failed to retrieve orders' });
        }

        // Combine the data
        const responseData = {
            ...customerData,
            addresses: addressesData,
            partnerships: partnershipsData.map(partnership => ({
                ...partnership,
                partner: partnersData.find(partner => 
                    partner.id === (partnership.customer_1_id === parseInt(customerId) 
                        ? partnership.customer_2_id 
                        : partnership.customer_1_id)
                )
            })),
            orders: ordersData
        };

        res.json(responseData);
    } catch (error) {
        console.error('Unexpected Error:', error);
        res.status(500).json({ error: 'An unexpected error occurred', details: error.message });
    }
});

router.get('/search-customers', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;
    const { query } = req.query;

    if (!query) {
        return res.json([]);
    }

    try {
        const { data: customers, error: customerError  } = await supabase
            .from('cy_customers')
            .select('id, name')
            .ilike('name', `%${query}%`)
            .limit(5)
            .eq('subscription_id', subscription_id);

        if (customerError) {
            throw customerError;
        }

        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/search-partnership', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;
    const { query, profession, currentCustomerId } = req.query;

    if (!profession) {
        return res.status(400).json({ error: 'Profession parameter is required.' });
    }

    if (!query) {
        return res.json([]);
    }

    try {
        // Step 1: Fetch all partnerships for the current customer
        const { data: partnerships, error: partnershipError } = await supabase
            .from('cy_partnerships') // Replace with your actual table name
            .select('customer_1_id, customer_2_id')
            .or(`customer_1_id.eq.${currentCustomerId},customer_2_id.eq.${currentCustomerId}`);

        if (partnershipError) {
            throw partnershipError;
        }

        // Step 2: Extract all associated customer IDs
        const excludedIds = new Set([parseInt(currentCustomerId)]); // Start with the current customer ID
        partnerships.forEach(partnership => {
            if (partnership.customer_1_id !== parseInt(currentCustomerId)) {
                excludedIds.add(partnership.customer_1_id);
            }
            if (partnership.customer_2_id !== parseInt(currentCustomerId)) {
                excludedIds.add(partnership.customer_2_id);
            }
        });

        // Step 3: Fetch customers excluding these IDs
        const { data: customers, error: customerError  } = await supabase
            .from('cy_customers')
            .select('id, name')
            .ilike('name', `%${query}%`)
            .filter('profession', profession === 'individual' ? 'neq' : 'eq', 'individual')
            // .not('id', 'eq', currentCustomerId)
            .not('id', 'in', `(${[...excludedIds].join(',')})`)
            .limit(5)
            .eq('subscription_id', subscription_id);

        if (customerError) {
            throw customerError;
        }

        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/customers', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { 
            information,
            address
        } = req.body;

        const {
            name,
            profession,
            phone_1,
            phone_2,
            tax_identification_number,
            tax_office,
            email
        } = information;

        const { data: customerData, error: customerError } = await supabase
            .from('cy_customers')
            .insert([{
                name,
                profession,
                phone_1,
                phone_2,
                tax_identification_number,
                tax_office,
                email,
                subscription_id: subscription_id
            }])
            .select('id') // Select the ID of the inserted customer
            .single();

        if (customerError) {
            throw customerError;
        }

        const customerId = customerData.id;

        const {
            street_address,
            area,
            postal_code,
            city,
            region,
            country
        } = address;

        const { error: addressError } = await supabase
            .from('cy_addresses')
            .insert([{
                street_address,
                area,
                postal_code,
                city,
                region,
                country,
                customer_id: customerId,
                subscription_id,
            }]);

        if (addressError) {
            throw addressError;
        }

        res.json({ message: 'Customer and address added successfully.' });

    } catch (error) {
        console.error('Error inserting customer or address:', error);
        res.status(500).json({ error: 'An error occurred while adding customer and address.' });
    }
});

router.put('/customer/:customerId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { customerId } = req.params;
        const {
            name,
            profession,
            phone_1,
            phone_2,
            tax_identification_number,
            tax_office,
            email
         } = req.body;

        const { data, error } = await supabase
            .from('cy_customers')
            .update({
                name,
                profession,
                phone_1,
                phone_2,
                tax_identification_number,
                tax_office,
                email
            })
            .eq('id', customerId)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})

router.delete('/customer/:id', authenticateToken, async (req, res) => {

    const { id } = req.params;
    const { deleteAll } = req.query; // Pass as query parameter
    const { subscription_id } = req.user;

    try {
        // First, verify the customer belongs to the current subscription
        const { data: customerCheck, error: customerCheckError } = await supabase
            .from('cy_customers')
            .select('id')
            .eq('id', id)
            .eq('subscription_id', subscription_id)
            .single();

        if (customerCheckError || !customerCheck) {
            return res.status(404).json({ error: 'Customer not found or unauthorized' });
        }

        // If deleteAll is true, delete everything including orders
        if (deleteAll) {
            // Delete orders
            const { error: ordersDeleteError } = await supabase
                .from('cy_orders')
                .delete()
                .eq('customer_id', id)
                .eq('subscription_id', subscription_id);

            if (ordersDeleteError) {
                return res.status(500).json({ error: 'Failed to delete customer orders' });
            }
        }
            
        // Delete addresses
        const { error: addressesDeleteError } = await supabase
            .from('cy_addresses')
            .delete()
            .eq('customer_id', id)
            .eq('subscription_id', subscription_id);

        if (addressesDeleteError) {
            return res.status(500).json({ error: 'Failed to delete customer addresses' });
        }

        // Delete partnerships
        const { error: partnershipsDeleteError } = await supabase
        .from('cy_partnerships')
        .delete()
        .or(
            `customer_1_id.eq.${id},customer_2_id.eq.${id}`
        )
        .eq('subscription_id', subscription_id);

        if (partnershipsDeleteError) {
            return res.status(500).json({ error: 'Failed to delete customer partnerships' });
        }

        // Finally, delete the customer
        const { error: customerDeleteError } = await supabase
            .from('cy_customers')
            .delete()
            .eq('id', id)
            .eq('subscription_id', subscription_id);

        if (customerDeleteError) {
            return res.status(500).json({ error: 'Failed to delete customer' });
        }

        res.status(200).json({ 
            message: deleteAll
                ? 'Customer and all related data deleted' 
                : 'Customer deleted, keeping orders' 
        });

    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

// Addresses
router.get('/addresses', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_addresses')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

router.post('/customer-addresses', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    const { customer_id } = req.body;

    console.log(customer_id)

    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_addresses')
            .select('*')
            .eq('customer_id', customer_id)
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

router.post('/address', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { 
            street_address,
            area,
            postal_code,
            city,
            region,
            country,
            customer_id
        } = req.body;

        const { data, error } = await supabase
            .from('cy_addresses')
            .insert([{
                street_address,
                area,
                postal_code,
                city,
                region,
                country,
                customer_id: customer_id,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/address/:addressId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { addressId } = req.params;
        const {
            street_address,
            area,
            postal_code,
            city,
            region,
            country,
            customer_id
        } = req.body;

        const { data, error } = await supabase
            .from('cy_addresses')
            .update({
                street_address,
                area,
                postal_code,
                city,
                region,
                country
            })
            .eq('id', addressId)
            .eq('customer_id', customer_id)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})

router.delete('/address/:addressId', authenticateToken, async (req, res) => {
    const { addressId } = req.params;
    const { subscription_id } = req.user;

    try {
        const { data, error } = await supabase
            .from('cy_addresses')
            .delete()
            .eq('id', addressId)
            .eq('subscription_id', subscription_id);

        if (error) {
            console.error('Error deleting address:', error);
            return res.status(500).json({ message: 'Failed to delete address.' });
        }

        res.json({ message: 'Address successfully deleted.', data });
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ message: 'An unexpected error occurred.' });
    }
});

// Partnerships
router.get('/partnerships', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all clothing data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_partnerships')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

router.post('/partnership', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { customer, partner } = req.body;

        const { data, error } = await supabase
            .from('cy_partnerships')
            .insert([{
                customer_1_id: customer,
                customer_2_id: partner,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.delete('/partnership/:customer/:partner', authenticateToken, async (req, res) => {
    const { customer, partner } = req.params;
    const { subscription_id } = req.user;

    try {
        const { data, error } = await supabase
            .from('cy_partnerships')
            .delete()
            .in('customer_1_id', [customer, partner])
            .in('customer_2_id', [customer, partner])
            .eq('subscription_id', subscription_id);

        if (error) {
            console.error('Error deleting partnership:', error);
            return res.status(500).json({ message: 'Failed to delete partnership.' });
        }

        res.json({ message: 'Partnership successfully deleted.', data });
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ message: 'An unexpected error occurred.' });
    }
});

// Orders
router.get('/orders', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_orders')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

router.get('/orders-information', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { page = 1, limit = 10 } = req.query; // Default values for page and limit
        const offset = (page - 1) * limit;

        const { data: orders, count, error } = await supabase
            .from('cy_orders_information')
            .select('*', { count: 'exact' }) // Select all orders and count the total number
            .eq('subscription_id', subscription_id)
            .order('order_id', { ascending: true })
            .range(offset, offset + limit - 1); // Get orders for the current page

        if (error) {
            throw error;
        }

        const totalPages = count === 0 ? 1 : Math.ceil(count / limit);

        res.json({
            orders,
            totalPages,
            totalOrders: count, // Return the total number of orders for better context
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders.' });
    }
});

router.get('/order/:orderId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { orderId } = req.params;
    
    try {
        // Validate orderId
        if (isNaN(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        // Fetch the order
        const { data: orderData, error: orderError } = await supabase
            .from('cy_orders')
            .select('*')
            .eq('id', orderId)
            .eq('subscription_id', subscription_id)
            .single();

        if (orderError || !orderData) {
            console.error('Order Query Error:', orderError);
            return res.status(404).json({ error: 'Order not found' });
        }

        const customerId = orderData.customer_id;

        // Fetch the customer
        const { data: customerData, error: customerError } = await supabase
            .from('cy_customers')
            .select('*')
            .eq('id', customerId)
            .eq('subscription_id', subscription_id)
            .single();

        if (customerError || !customerData) {
            console.error('Customer Query Error:', customerError);
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Fetch order items
        const { data: orderItemsData, error: orderItemsError } = await supabase
            .from('cy_order_items')
            .select('*')
            .eq('order_id', orderId)
            .eq('subscription_id', subscription_id)
            .order('created_at', { ascending: true });

        if (orderItemsError || !orderItemsData.length) {
            console.error('Order items Query Error:', orderItemsError);
            return res.status(404).json({ error: 'No order items found' });
        }

        // Extract material_and_size_ids from order items
        const materialAndSizeIds = orderItemsData.map(item => item.material_and_size_id);

        // Fetch material relations for the given items
        const { data: relationsData, error: relationsError } = await supabase
            .from('cy_materials_with_sizes')
            .select('material_size_id, material_name, description, size_name, quantity, price')
            .eq('subscription_id', subscription_id)
            .in('material_size_id', materialAndSizeIds);

        if (relationsError) {
            console.error('Relations Query Error:', relationsError);
            return res.status(500).json({ error: 'Failed to retrieve relations' });
        }

        // Combine order items with relation data
        const orderItemsDataCombined = orderItemsData.map(orderItem => ({
            ...orderItem,
            orderItemInfo: relationsData.find(r => r.material_size_id === orderItem.material_and_size_id) || null
        }));

        // Return the combined data
        res.json({
            order: orderData,
            customer: customerData,
            orderItems: orderItemsDataCombined
        });

    } catch (error) {
        console.error('Database Retrieval Error:', error);
        res.status(500).json({ error: 'An error occurred while retrieving data.' });
    }
});

router.get('/df-orders', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    const { date } = req.query;

    // Validate date
    if (!date || isNaN(new Date(date))) {
        return res.status(400).json({ error: 'Invalid or missing date parameter.' });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0); // Start of the day
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999); // End of the day
    
    try {
        // Fetch the orders
        const { data, error } = await supabase
            .from('cy_orders_information')
            .select('*')
            .eq('subscription_id', subscription_id)
            .gte('shipping_at', startDate.toISOString())
            .lte('shipping_at', endDate.toISOString());

        if (error) {
            throw error;
        }

        res.json(data);

    } catch (error) {
        console.error('Database Retrieval Error:', error);
        res.status(500).json({ error: 'An error occurred while retrieving data.' });
    }
});

router.post('/order', authenticateToken, async(req, res) => {

    const { subscription_id } = req.user;

    try {
        const { 
            customer_id,
            address_id,
            floor_id,
            contact_phone,
            material_lines,
            shipping_at,
            vehicle_id,
            driver_id,
            method_id,
            amount,
            discount_applied,
            transportExpenses,
            additionalExpenses,
            total
        } = req.body;

        // Step 1: Insert the order
        const { data: orderData, error: orderError } = await supabase
            .from('cy_orders')
            .insert([{
                created_at: new Date(),
                customer_id: parseInt(customer_id,10),
                address_id: parseInt(address_id,10),
                floor_id: parseInt(floor_id,10),
                contact_phone,
                shipping_at,
                vehicle_id: parseInt(vehicle_id,10),
                driver_id: parseInt(driver_id,10),
                payment_method_id: parseInt(method_id,10),
                amount: parseFloat(amount),
                discount_applied,
                shipping_costs: parseFloat(transportExpenses),
                additional_costs: isNaN(parseFloat(additionalExpenses)) || parseFloat(additionalExpenses) <= 0 ? null : parseFloat(additionalExpenses),
                total_amount: parseFloat(total),
                status: "In Progress",
                subscription_id: subscription_id
            }])
            .select('id') // Select the ID of the inserted customer
            .single();

        if (orderError) {
            throw orderError;
        }
        
        const orderId = orderData.id;

        // Step 2: Validate Material Lines Availability
        const materialAndSizeIds = material_lines.map(item => item.material_id);

        const { data: relationsData, error: relationsError } = await supabase
            .from('cy_materials_and_sizes')
            .select('id, quantity')
            .eq('subscription_id', subscription_id)
            .in('id', materialAndSizeIds);

        if (relationsError) {
            throw relationsError;
        }

        const deductedQuantities = []; // Track deducted quantities for potential rollback

        // Validate and update material quantities
        for (const line of material_lines) {
            const material = relationsData.find(item => item.id === parseInt(line.material_id, 10));

            if (!material) {
                throw new Error(`Material with ID ${line.material_id} not found.`);
            }

            const availableQuantity = material.quantity;
            const newOrderItemQuantity = parseInt(line.material_quantity, 10)

            if (newOrderItemQuantity > availableQuantity) {
                throw new Error(`Not enough quantity for material ID ${line.material_id}.`);
            }

            // Update the material's available quantity
            const newQuantity = availableQuantity - newOrderItemQuantity;
            const { error: updateError } = await supabase
                .from('cy_materials_and_sizes')
                .update({ quantity: newQuantity })
                .eq('id', line.material_id)
                .eq('subscription_id', subscription_id);

            if (updateError) {
                throw updateError;
            }

            // Track the deduction for rollback purposes
            deductedQuantities.push({ material_size_id: line.material_id });
        }

         // Step 3: Insert Material Lines into Order Items
         const materialLinesToInsert = material_lines.map((line) => ({
            material_and_size_id: parseInt(line.material_id, 10),
            quantity: parseInt(line.material_quantity, 10),
            order_id: orderId,
            subscription_id: subscription_id
        }));

        const { error: orderItemsError } = await supabase
            .from('cy_order_items')
            .insert(materialLinesToInsert);

        if (orderItemsError) {
            // Rollback: Restore material quantities
            for (const deduction of deductedQuantities) {
                const { error: restoreError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: relationsData.find(item => item.id === deduction.material_size_id).quantity })
                    .eq('id', deduction.material_size_id)
                    .eq('subscription_id', subscription_id);

                if (restoreError) {
                    console.error(`Failed to restore quantity for material ID ${deduction.material_size_id}:`, restoreError);
                }
            }

            // Rollback: Delete the order and any associated items
            await supabase.from('cy_order_items').delete().eq('order_id', orderId);
            await supabase.from('cy_orders').delete().eq('id', orderId);

            throw new Error(`Failed to insert order items: ${orderItemsError.message}`);
        }

        res.json({ message: 'Order and items inserted successfully.' });

    } catch (error) {
        console.error('Error during order creation:', error);
        res.status(500).json({ error: 'An error occurred during order creation.' });
    }
})

router.put('/order/:orderId', authenticateToken, async(req, res) => {

    const { subscription_id } = req.user;
    const { orderId } = req.params;

    try {
        const { 
            customer_id,
            address_id,
            floor_id,
            contact_phone,
            material_lines,
            shipping_at,
            vehicle_id,
            driver_id,
            method_id,
            amount,
            discount_applied,
            transportExpenses,
            additionalExpenses,
            total,
            status
        } = req.body;


        // Select the status before updating
        const { data: existingOrderData, error: existingOrderError } = await supabase
            .from('cy_orders')
            .select('status')
            .eq('id', orderId)
            .eq('subscription_id', subscription_id)
            .single();

        if (existingOrderError) {
            throw existingOrderError;
        }

        // Find available quantity for existing order items and seperate existing orderItemsData and material_lines to oldUnmatchedItems, newUnmatchedItems, matchedItems
        const { data: orderItemsData, error: orderItemsError } = await supabase
            .from('cy_order_items')
            .select('id, material_and_size_id, quantity')
            .eq('order_id', orderId)
            .eq('subscription_id', subscription_id);

        if (orderItemsError) {
            throw orderItemsError;
        }

        const orderItemsIds = orderItemsData.map(item => item.material_and_size_id);

        const { data: relationsData, error: relationsError } = await supabase
            .from('cy_materials_and_sizes')
            .select('id, quantity')
            .eq('subscription_id', subscription_id)
            .in('id', orderItemsIds);

        if (relationsError) {
            throw relationsError;
        }

        const oldOrderItemsData = orderItemsData.map(item => {
            const material = relationsData.find(r=> r.id === item.material_and_size_id)
            return {
                order_item_id: item.id,
                material_id: item.material_and_size_id,
                material_quantity: item.quantity,
                available_quantity: material.quantity
            }
        })

        const materialLinesIdsSet = new Set(material_lines.map(line => line.material_id));
        const orderItemsIdsSet = new Set(oldOrderItemsData.map(line => line.material_id));

        const oldUnmatchedItems = oldOrderItemsData.filter(
            item => !materialLinesIdsSet.has(item.material_id)
        );

        const newUnmatchedItems = material_lines.filter(
            item => !orderItemsIdsSet.has(item.material_id)
        );

        const matchedItemsWithoutOrderItemId = material_lines.filter(
            item => orderItemsIdsSet.has(item.material_id)
        );

        const matchedItems = matchedItemsWithoutOrderItemId.map(item => {
            const orderItem = orderItemsData.find(orderItem => orderItem.material_and_size_id === item.material_id)
            return {
                ...item,
                order_item_id: orderItem.id
            }
        })

        // console.log(oldUnmatchedItems, newUnmatchedItems, matchedItems)

        
        // Update the cy_materials_and_sizes (update the available quantities)
        if (existingOrderData.status === "Cancelled" && status === "Cancelled") { // No changes in available quantity

            // Do nothing
            
        } else if (existingOrderData.status !== "Cancelled" && status === "Cancelled") { // Add back the previous removed quantity

            for (const line of oldOrderItemsData) {

                const updatedQuantity = line.available_quantity + line.material_quantity

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) throw updateError;

            }

        } else if (existingOrderData.status === "Cancelled" && status !== "Cancelled") { // Remove the new quantity

            for (const line of newUnmatchedItems) {

                const updatedQuantity = line.available_quantity - line.material_quantity
                if (updatedQuantity < 0) throw new Error(`Not enough quantity for material ID ${line.material_id}.`);

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) throw updateError;

            }

            for (const line of matchedItems) {

                const updatedQuantity = line.available_quantity - line.material_quantity
                if (updatedQuantity < 0) throw new Error(`Not enough quantity for material ID ${line.material_id}.`);

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) throw updateError;

            }

        } else { // Adjust based on quantity difference

            for (const line of oldUnmatchedItems) {

                const updatedQuantity = line.available_quantity + line.material_quantity

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) throw updateError;

            }

            for (const line of newUnmatchedItems) {

                const updatedQuantity = line.available_quantity - line.material_quantity
                if (updatedQuantity < 0) throw new Error(`Not enough quantity for material ID ${line.material_id}.`);

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) throw updateError;

            }

            for (const line of matchedItems) {

                const oldOrderItem = oldOrderItemsData.find(o => o.material_id === line.material_id)
                const updatedQuantity = line.available_quantity - (line.material_quantity - oldOrderItem.material_quantity)
                if (updatedQuantity < 0) throw new Error(`Not enough quantity for material ID ${line.material_id}.`);

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) throw updateError;

            }
        }

        // Update the cy_order_items
        for (const line of oldUnmatchedItems) {

            const { error: orderItemDeleteError } = await supabase
                .from('cy_order_items')
                .delete()
                .eq('id', line.order_item_id)
                .eq('order_id',orderId)
                .eq('subscription_id', subscription_id);

            if (orderItemDeleteError) throw orderItemDeleteError;

        }

        for (const line of newUnmatchedItems) {

            const { error: orderItemPostError } = await supabase
                .from('cy_order_items')
                .insert([{
                    quantity: parseInt(line.material_quantity,10),
                    material_and_size_id: line.material_id,
                    order_id: orderId,
                    subscription_id: subscription_id
                }]);

            if (orderItemPostError) throw orderItemPostError;

        }

        for (const line of matchedItems) {

            const { error: orderItemUpdateError } = await supabase
                    .from('cy_order_items')
                    .update({ quantity: line.material_quantity })
                    .eq('id', line.order_item_id)
                    .eq('order_id',orderId)
                    .eq('subscription_id', subscription_id);

                if (orderItemUpdateError) throw orderItemUpdateError;
        }


        // Update the order
        const { error: orderError } = await supabase
            .from('cy_orders')
            .update([{
                customer_id: parseInt(customer_id,10),
                address_id: parseInt(address_id,10),
                floor_id: parseInt(floor_id,10),
                contact_phone,
                shipping_at,
                vehicle_id: parseInt(vehicle_id,10),
                driver_id: parseInt(driver_id,10),
                payment_method_id: parseInt(method_id,10),
                amount: parseFloat(amount),
                discount_applied,
                shipping_costs: parseFloat(transportExpenses),
                additional_costs: isNaN(parseFloat(additionalExpenses)) || parseFloat(additionalExpenses) <= 0 ? null : parseFloat(additionalExpenses),
                total_amount: parseFloat(total),
                status,
            }])
            .eq('id', orderId)
            .eq('subscription_id', subscription_id);

        if (orderError) {
            console.error('Error updating order:', orderError);
            return res.status(500).json({ error: 'Failed to update the order.' });
        }

        res.json({ message: 'Order and items updated successfully.' });

    } catch (error) {
        console.error('Error during order update:', error);
        res.status(500).json({ error: 'An error occurred during the order update.' });
    }
})

router.delete('/order/:orderId', authenticateToken, async (req, res) => {
    const { orderId } = req.params;
    const { subscription_id } = req.user;
    const { status } = req.query;

    try {

        // Check order status
        // If "Cancelled" delete order items then delete order
        // If not "Cancelled" return/update order items quantity then delete order items then delete order

        if(status !== "Cancelled"){

            const { data: orderItemsToReturnData, error: orderItemsToReturnQuantityError } = await supabase
                .from('cy_order_items')
                .select('*')
                .eq('order_id', orderId)
                .eq('subscription_id', subscription_id);

            if (orderItemsToReturnQuantityError) {
                throw orderItemsToReturnQuantityError;
            }

            const orderItemsIds = orderItemsToReturnData.map(item => item.material_and_size_id);

            const { data: materialsData, error: materialsError } = await supabase
                .from('cy_materials_with_sizes')
                .select('material_size_id, quantity')
                .eq('subscription_id', subscription_id)
                .in('material_size_id', orderItemsIds);

            if (materialsError) {
                throw materialsError;
            }

            for (const item of orderItemsToReturnData) {

                const material = materialsData.find(m => m.material_size_id === item.material_and_size_id);
                if (!material) throw new Error(`Material not found for ID: ${item.material_and_size_id}`);

                const updatedQuantity = material.quantity + item.quantity;

                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: updatedQuantity })
                    .eq('id', item.material_and_size_id)
                    .eq('subscription_id', item.subscription_id);
    
                if (updateError) {
                    throw updateError;
                }
            }

        }

        const { data: orderItemsData, error: orderItemsError } = await supabase
            .from('cy_order_items')
            .delete()
            .eq('order_id', orderId)
            .eq('subscription_id', subscription_id);

        if (orderItemsError) {
            console.error('Error deleting order items:', orderItemsError);
            return res.status(500).json({ message: 'Failed to delete order items.' });
        }

        const { data: orderData, error: orderError } = await supabase
            .from('cy_orders')
            .delete()
            .eq('id', orderId)
            .eq('subscription_id', subscription_id);

        if (orderError) {
            console.error('Error deleting order:', orderError);
            return res.status(500).json({ message: 'Failed to delete order.' });
        }

        res.json({ message: 'Order and order items successfully deleted.', orderData, orderItemsData });
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ message: 'An unexpected error occurred.' });
    }
});

// Floors
router.get('/floors', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_floors')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

// Vehicles
router.get('/vehicles', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_vehicles')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

// Drivers
router.get('/drivers', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    
    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_drivers')
            .select('*')
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

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

// Payment Methods
router.get('/payment-methods', async (req, res) => {

    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_payment_methods')
            .select('*')
            .order('id', { ascending: true });

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

// Daily Record
router.get('/daily-record', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { date } = req.query;
    
    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_daily_records')
            .select('*')
            .eq('record_date', date)
            .eq('subscription_id', subscription_id)
            .single();

        // if (error) {
        //     console.error('Error fetching daily record:', error);
        //     return res.status(500).json({ error: 'Error fetching daily record' });
        // }

        // If no record is found, send a response indicating that
        // if (!data) {
        //     return res.status(404).json({ message: 'No daily record found for this date' });
        // }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.post('/daily-record', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;

    try {
        const { 
            record_date,
            amount
        } = req.body;        

        const { data, error } = await supabase
            .from('cy_daily_records')
            .insert([{
                record_date,
                amount: parseFloat(amount).toFixed(2),
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/daily-record/:dailyRecordId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;

    try {
        const { dailyRecordId } = req.params;
        const {
            amount
        } = req.body;

        const { data, error } = await supabase
            .from('cy_daily_records')
            .update({
                amount
            })
            .eq('id', dailyRecordId)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})

// Revenue
router.get('/revenue', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { dailyRecordId } = req.query;

    try {
        // Fetch revenues
        const { data: revenueData, error: revenueError } = await supabase
            .from('cy_revenue_information')
            .select('*')
            .eq('daily_record_id', dailyRecordId)
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

        if (revenueError) {
            throw revenueError;
        }

        if(revenueData.length <= 0){
            res.json([]);
            return
        }

        // Fetch items for each revenue
        const revenueIds = revenueData.map((revenue) => revenue.id);
        const { data: itemsData, error: itemsError } = await supabase
            .from('cy_revenue_items')
            .select('*')
            .in('revenue_id', revenueIds);

        if (itemsError) {
            throw itemsError;
        }

        const materialIds = itemsData.map((item) => item.material_and_size_id);
        const { data: materialsData, error: materialsError } = await supabase
            .from('cy_materials_with_sizes')
            .select('material_size_id, material_name, description, size_name, quantity, price')
            .in('material_size_id', materialIds);

        if (materialsError) {
            throw materialsError;
        }

        // Create a simple object for quick lookup of material details by material_size_id
        const materialsMap = {};
        for (let i = 0; i < materialsData.length; i++) {
            const material = materialsData[i];
            materialsMap[material.material_size_id] = material;
        }

        // Combine revenues with their items, flattening material details into items
        const combinedData = revenueData.map((revenue) => {
            const revenueItems = itemsData
                .filter((item) => item.revenue_id === revenue.id)
                .map((item) => {
                    // Get the material details from the materialsMap using material_and_size_id
                    const materialDetails = materialsMap[item.material_and_size_id] || {};
                    // Rename the `quantity` from materialDetails to `available_quantity`
                    const { quantity: available_quantity, ...restMaterialDetails } = materialDetails;
                    return {
                        ...item,
                        available_quantity, // Add renamed quantity
                        ...restMaterialDetails, // Spread the remaining material details
                    };
                });

            return {
                ...revenue,
                items: revenueItems,
            };
        });

        res.json(combinedData);

    } catch (error) {
        console.error('Error retrieving data from the database:', error);
        res.status(500).json({ error: 'Error retrieving data' });
    }
});

router.post('/revenue', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;
    const { dailyRecordId } = req.query;

    if (!dailyRecordId) {
        return res.status(400).json({ error: 'Invalid or missing daily record id parameter.' });
    }

    try {
        const { 
            material_lines,
            method_id,
            amount,
            discount_applied
        } = req.body;

        for (const line of material_lines) {

            // Update the material's available quantity
            const newQuantity = line.available_quantity - Number(line.material_quantity);
            const { error: updateError } = await supabase
                .from('cy_materials_and_sizes')
                .update({ quantity: newQuantity })
                .eq('id', line.material_id)
                .eq('subscription_id', subscription_id);

            if (updateError) {
                throw updateError;
            }
        }

        let name = material_lines.map(line => line.material_name).join(", ");

        const { data: revenueData, error: revenueError } = await supabase
            .from('cy_revenue')
            .insert([{
                name,
                amount,
                discount_applied,
                payment_method_id: Number(method_id),
                daily_record_id: Number(dailyRecordId),
                subscription_id: subscription_id
            }])
            .select('id')
            .single();

        if (revenueError) {
            return res.status(500).json({ error: 'Failed to insert revenue data.', details: revenueError.message });
        }

        const revenueId = revenueData.id;

        const revenueItemsToInsert = material_lines.map(line => {
            const {material_id, material_quantity} = line
            return {
                material_and_size_id: material_id,
                quantity: Number(material_quantity),
                revenue_id: revenueId,
                subscription_id: subscription_id
            }
        })

        const { data: revenueItemsData, error: revenueItemsError } = await supabase
            .from('cy_revenue_items')
            .insert(revenueItemsToInsert);

        if (revenueItemsError) {
            return res.status(500).json({ error: 'Failed to insert revenue items data.', details: revenueItemsError.message });
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/revenue/:revenueId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { dailyRecordId } = req.query;

    try {
        const { revenueId } = req.params;
        const {
            material_lines,
            method_id,
            amount,
            discount_applied
        } = req.body;


        const { data: revenueItemsData, error: revenueItemsError } = await supabase
            .from('cy_revenue_items')
            .select('id, material_and_size_id, quantity')
            .eq('revenue_id', revenueId)
            .eq('subscription_id', subscription_id);

        // if (revenueItemsError) {
        //     throw revenueItemsError;
        // }

        const materialLinesIdsSet = new Set(material_lines.map(line => line.material_id));
        const revenueItemsIdsSet = new Set(revenueItemsData.map(line => line.material_and_size_id));

        // Return the quantities of the old unmatched items and remove them from cy_revenue_items
        const oldUnmatchedItemsWithoutAvailableQty = revenueItemsData.filter(
            item => !materialLinesIdsSet.has(item.material_and_size_id)
        );

        const oldUnmatchedItemsIds = oldUnmatchedItemsWithoutAvailableQty.map(item => item.material_and_size_id);

        const { data: materialsData, error: materialsError } = await supabase
            .from('cy_materials_with_sizes')
            .select('material_size_id, quantity')
            .eq('subscription_id', subscription_id)
            .in('material_size_id', oldUnmatchedItemsIds);

        // if (materialsError) {
        //     throw materialsError;
        // }

        const oldUnmatchedItems = oldUnmatchedItemsWithoutAvailableQty.map(item => {

            const material = materialsData.find(material => material.material_size_id === item.material_and_size_id);

            return {
                revenue_item_id: item.id,
                material_id: item.material_and_size_id,
                material_quantity: item.quantity,
                available_quantity: material ? material.quantity : 0 
            };
        });

        // Remove the quantities of the new unmatched items and add them to cy_revenue_items
        const newUnmatchedItems = material_lines.filter(
            item => !revenueItemsIdsSet.has(item.material_id)
        );

        // Update the quantities of the matched items
        const matchedItemsWithoutRevenueItemId = material_lines.filter(
            item => revenueItemsIdsSet.has(item.material_id)
        );

        const matchedItems = matchedItemsWithoutRevenueItemId.map(item => {

            const revenueItem = revenueItemsData.find(r => r.material_and_size_id === item.material_id)
            return {
                ...item,
                revenue_item_id: revenueItem.id
            }
        })
        // console.log(oldUnmatchedItems)
        // console.log(newUnmatchedItems)
        // console.log(matchedItems)

        // For old unmatched items
        // PUT -> cy_material_and_sizes -> by adding to available quantities the quantities from old revenue items
        // DELETE -> cy_revenue_items

        for (const line of oldUnmatchedItems) {

            const qtyToUpdate = line.available_quantity + parseInt(line.material_quantity,10);

            const { error: updateError } = await supabase
                .from('cy_materials_and_sizes')
                .update({ quantity: qtyToUpdate })
                .eq('id', line.material_id)
                .eq('subscription_id', subscription_id);

            if (updateError) {
                throw updateError;
            }

            const { error: revenueItemError } = await supabase
                .from('cy_revenue_items')
                .delete()
                .eq('id', line.revenue_item_id)
                .eq('revenue_id',revenueId)
                .eq('subscription_id', subscription_id);

            if (revenueItemError) {
                console.error('Error deleting revenue item:', revenueItemError);
                return res.status(500).json({ message: 'Failed to delete revenue item.' });
            }

        }
        

        // For new unmatched items
        // PUT -> cy_material_and_sizes -> by removing from available quantities the quantities from new revenue items
        // POST -> cy_revenue_items

        for (const line of newUnmatchedItems) {

            const qtyToUpdate = line.available_quantity - parseInt(line.material_quantity,10);

            if (qtyToUpdate < 0) {
                throw new Error(`Not enough quantity for material ID ${line.material_id}.`);
            }

            const { error: updateError } = await supabase
                .from('cy_materials_and_sizes')
                .update({ quantity: qtyToUpdate })
                .eq('id', line.material_id)
                .eq('subscription_id', subscription_id);

            if (updateError) {
                throw updateError;
            }

            const { error: postError } = await supabase
                .from('cy_revenue_items')
                .insert([{
                    quantity: parseInt(line.material_quantity,10),
                    material_and_size_id: line.material_id,
                    revenue_id: revenueId,
                    subscription_id: subscription_id
                }]);

            if (postError) {
                throw postError;
            }

        }

        // For matched items
        // PUT -> cy_material_and_sizes -> available quantities (available_quantity - (material_quantity - oldQuantity))

        for (const line of matchedItems) {

            const oldQuantity = revenueItemsData.find(item => item.material_and_size_id === line.material_id).quantity;
            const qtyToUpdate = line.available_quantity - (parseInt(line.material_quantity,10) - oldQuantity);

            if (qtyToUpdate < 0) {
                throw new Error(`Not enough quantity for material ID ${line.material_id}.`);
            }

            if (qtyToUpdate !== line.available_quantity) {
                const { error: updateError } = await supabase
                    .from('cy_materials_and_sizes')
                    .update({ quantity: qtyToUpdate })
                    .eq('id', line.material_id)
                    .eq('subscription_id', subscription_id);

                if (updateError) {
                    throw updateError;
                }
            }

            const { error: revenueItemsUpdateError } = await supabase
                    .from('cy_revenue_items')
                    .update({ quantity: line.material_quantity })
                    .eq('id', line.revenue_item_id)
                    .eq('revenue_id', revenueId)
                    .eq('subscription_id', subscription_id);

                if (revenueItemsUpdateError) {
                    throw revenueItemsUpdateError;
                }
        }


        // UPDATE Revenue
        let name = material_lines.map(line => line.material_name).join(", ");

        const { error } = await supabase
            .from('cy_revenue')
            .update({
                name,
                amount,
                discount_applied,
                payment_method_id: Number(method_id)
            })
            .eq('id', revenueId)
            .eq('daily_record_id', Number(dailyRecordId))
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})

router.delete('/revenue/:revenueId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { revenueId } = req.params;

    try {

        // 1. Update the quantities of cy_material_and_sizes. Add the quantities from revenue items to the available quantities of cy_material_and_sizes
        // 2. Remove all the revenue items of the revenue with revenue_id = revenueId
        // 3. Remove the revenue

        const { data: revenueItemsData, error: revenueItemsError } = await supabase
            .from('cy_revenue_items')
            .select('id, material_and_size_id, quantity')
            .eq('revenue_id', revenueId)
            .eq('subscription_id', subscription_id);

        if (revenueItemsError) {
            throw revenueItemsError;
        }

        const revenueItemsIds = revenueItemsData.map(item => item.material_and_size_id);

        const { data: materialsData, error: materialsError } = await supabase
            .from('cy_materials_and_sizes')
            .select('id, quantity')
            .eq('subscription_id', subscription_id)
            .in('id', revenueItemsIds);

        if (materialsError) {
            throw materialsError;
        }

        // Create a map for fast lookup
        const materialsMap = new Map(materialsData.map(item => [item.id, item.quantity]));

        // Create an array of updates
        const updates = [];

        for (const line of revenueItemsData) {
            const availableQuantity = materialsMap.get(line.material_and_size_id);

            const qtyToUpdate = availableQuantity + line.quantity;
            updates.push({
                id: line.material_and_size_id,
                subscription_id,
                quantity: qtyToUpdate,
            });
        }

        // Perform the update only if the material exists in the `materialsData`
        for (const update of updates) {
            const { error: updateError } = await supabase
                .from('cy_materials_and_sizes')
                .update({ quantity: update.quantity })
                .eq('id', update.id)
                .eq('subscription_id', update.subscription_id);

            if (updateError) {
                throw updateError;
            }
        }

        // Delete all the revenue items
        const { error: revItemsError } = await supabase
            .from('cy_revenue_items')
            .delete()
            .eq('revenue_id', revenueId)
            .eq('subscription_id', subscription_id);

        if (revItemsError) {
            console.error('Error deleting revenue items:', revItemsError);
            return res.status(500).json({ message: 'Failed to delete revenue items.' });
        }

        // Delete the revenue
        const { error: revenueError } = await supabase
            .from('cy_revenue')
            .delete()
            .eq('id', revenueId)
            .eq('subscription_id', subscription_id);

        if (revenueError) {
            console.error('Error deleting revenue:', revenueError);
            return res.status(500).json({ message: 'Failed to delete revenue.' });
        }

        res.json({ message: 'Revenue and revenue items successfully deleted.' });
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ message: 'An unexpected error occurred.' });
    }

})

// Expenses
router.get('/expenses', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { dailyRecordId } = req.query;
    
    try {
        // Fetch all data from the database using Supabase
        const { data, error } = await supabase
            .from('cy_expenses_information')
            .select('*')
            .eq('daily_record_id', dailyRecordId)
            .eq('subscription_id', subscription_id)
            .order('id', { ascending: true });

        if (error) {
            throw error; // If there's an error, throw it to be caught in the catch block
        }

        if(!data.length){
            res.json([]);
            return
        }

        // Return the retrieved data as a response
        res.json(data);

    } catch (error) {
        console.error('Σφάλμα κατά την ανάκτηση δεδομένων από τη βάση δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση δεδομένων' });
    }
});

router.post('/expense', authenticateToken, async (req, res) => {
    
    const { subscription_id } = req.user;
    const { dailyRecordId } = req.query;

    if (!dailyRecordId) {
        return res.status(400).json({ error: 'Invalid or missing daily record id parameter.' });
    }

    try {
        const { 
            expense,
            method_id,
            amount
        } = req.body;

        const { data, error } = await supabase
            .from('cy_expenses')
            .insert([{
                name: expense,
                amount: parseFloat(amount).toFixed(2),
                payment_method_id: parseInt(method_id,10),
                daily_record_id: dailyRecordId,
                subscription_id: subscription_id
            }]);

        if (error) {
            throw error;
        }

        res.json({ message: 'Τα δεδομένα εισήχθησαν με επιτυχία' });

    } catch (error) {
        console.error('Σφάλμα κατά την εισαγωγή δεδομένων:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.put('/expense/:expenseId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { dailyRecordId } = req.query;

    try {
        const { expenseId } = req.params;
        const {
            expense,
            method_id,
            amount
        } = req.body;

        const { error } = await supabase
            .from('cy_expenses')
            .update({
                name: expense,
                amount: parseFloat(amount).toFixed(2),
                payment_method_id: Number(method_id)
            })
            .eq('id', expenseId)
            .eq('daily_record_id', dailyRecordId)
            .eq('subscription_id', subscription_id);

        if (error) {
            throw error;
        }

        res.json({ message: 'Επιτυχής ενημέρωση στοιχείου' });


    } catch (error) {
        console.error('Σφάλμα κατά την ενημέρωση δεδομένων:', error)
        res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση δεδομένων' });
    }
})

router.delete('/expense/:expenseId', authenticateToken, async (req, res) => {

    const { subscription_id } = req.user;
    const { expenseId } = req.params;
    const { dailyRecordId } = req.query;

    try {
        const { error } = await supabase
            .from('cy_expenses')
            .delete()
            .eq('id', expenseId)
            .eq('daily_record_id', dailyRecordId)
            .eq('subscription_id', subscription_id);

        if (error) {
            console.error('Error deleting expense:', error);
            return res.status(500).json({ message: 'Failed to delete expense.' });
        }

        res.json({ message: 'Expense successfully deleted.' });
    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ message: 'An unexpected error occurred.' });
    }

})

module.exports = router;