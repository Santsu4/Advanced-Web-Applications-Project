
import pkg from 'pg';
const {Pool} = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});


export default function(app) {



//GET SEATS

    app.get('/api/seats', async (req, res) => {
        try{ 
            const screenId = req.query.screenId
            const screeningId = req.query.screeningId;

            if(!screenId){
                return res.status(400).json({
                    success:false,
                    error: 'screenId query parameter required'
                })
            }

            const seatsResult = await pool.query(`
                SELECT * FROM seats where screen_id = $1 ORDER BY id ASC
                `, [screenId])
          
                let seats = seatsResult.rows;
                let bookedSeatsId = [];

                if(screeningId){
                    const screeningSeats = await pool.query(`
                    SELECT 
                    tickets.seat_id
                    FROM tickets
                    JOIN bookings ON tickets.booking_id = bookings.id
                    WHERE bookings.screening_id = $1`, [screeningId])

                        bookedSeatsId = screeningSeats.rows.map(lol => lol.seat_id)
                }
        
                seats = seats.map(seat =>{
                    return{
                    ...seat,
                    isBooked: bookedSeatsId.includes(seat.id),
                    isReservedByCeo: seat.id === 1 || Boolean(seat.is_ceo_reserved)
                    }

                    
                })

           res.status(200).json({success: true, data: seats})

        }catch (error){
            console.error('There was error fetching the seats')
            res.status(500).json({success: false, error: 'There was a inside error while fetching the Seat data'})
        }
    })

//get all screens
    app.get('/api/screens', async (req, res) => {
        try{
            const cityId = req.query.cityId;
            let query = `
            SELECT screens.id,
            screens.capacity,
            screens.wheelchair_capacity,
            screens.city_id,
            cities.name AS city_name
            FROM screens
            JOIN cities ON screens.city_id = cities.id
            `;


            let params = [];
            if(cityId){
                query += ` WHERE screens.city_id = $1`
                params.push(cityId)}
            
                query += ` ORDER BY screens.id ASC`

                    const queryResult = await pool.query(query, params)
            res.status(200).json({success: true, data: queryResult.rows})
        }catch(error){
            console.error('Error while fetching screens')
            res.status(500).json({success: false, error: 'There was an internal error while fetching screens'})
        }
    })

    //Get screen by id

    app.get('/api/screens/:id', async (req, res) =>{
        try{
            const id = req.params.id;
            //const cityId = req.query.cityId
            let query = await pool.query(`
                SELECT screens.id,
                screens.capacity,
                screens.wheelchair_capacity,
                screens.city_id,
                cities.name AS city_name
                FROM screens
                JOIN cities ON screens.city_id = cities.id
                WHERE screens.id = $1`, [id]);

            if(query.rows.length === 0){
                return res.status(404).json({success: false, error: 'Screen not found'})
            }

            res.status(200).json({success: true, data: query.rows[0]})
        }catch(error){
            console.error('There was error while fetching screen')
            res.status(500).json({success: false, error: 'There was an inside error while fetching screen'})
        }
    })




    //GET ALL FILMS

    app.get('/api/films', async (req, res)=>{
        try{
            const result = await pool.query('SELECT * FROM films')
            res.status(200).json({success: true, data: result.rows})
        }catch(error){
            res.status(500).json({success: false, error: 'There was a inside error while fetching films'})
        }
    })

    //GET FILM BY ID 

    app.get('/api/films/:id', async (req, res)=>{
        try{

            const idToSearch = req.params.id;

            const queryResult = await pool.query(`
                SELECT * 
                FROM films
                WHERE films.id = $1`, [idToSearch] )

                if(queryResult.rows.length === 0){
                    return res.status(404).json({success: false, error: 'Film not found'})
                }

                res.status(200).json({success: true, data: queryResult.rows[0]})

        }catch(error){
            console.error('There was an inside error while fetching the film')
            res.status(500).json({success: false, error: ' There was an inside error while fetching film'})
        }
    })
    

    //GET CITIEES

    app.get('/api/cities', async (req, res) => {
        try{
            const cities = await pool.query(`SELECT * FROM cities`)
            if(cities.rows.length == 0){
                return res.status(404).json({success: false, error: 'No cities found'})
            }
            const result = cities.rows

            res.status(200).json({success: true, data: result})

        }catch(error){
            console.error('There was an inside error while fetching cities')
            res.status(500).json({success: false, error: 'There was an inside error while fetching cities'})
        }

    })
    
    //GET CITY BY ID

    app.get('/api/cities/:id', async (req, res) => {
        try{
        const cityIdToFind = req.params.id;

        const queryResult = await pool.query('SELECT * FROM cities WHERE id = $1', [cityIdToFind])

        if(queryResult.rows.length == 0){
           return res.status(404).json({success: false, error: 'City not found'})
        }

            res.status(200).json({success: true, data: queryResult.rows[0] })
    }catch(error){
            console.error('There was an inside error while fetching cities')
            res.status(500).json({success: false, error: 'There was an inside error while fetching cities'})
    }

    })

    // GET SCREENINGS

    app.get('/api/screenings', async (req, res)=>{
    try{
        const cityId = req.query.cityId;
        const filmId = req.query.filmId;

        let query = `
        SELECT screenings.id,
        screenings.screening_time,
        films.title AS film_title,
        screens.id AS screen_id,
        screens.city_id,
        cities.name AS city_name
        FROM screenings
        JOIN films on screenings.film_id = films.Id
        JOIN screens on screenings.screen_id = screens.Id
        JOIN cities ON screens.city_id = cities.id
        `
        let params = [];

        if(filmId&&cityId){
            query += ' WHERE screenings.film_id = $1 AND screens.city_id = $2'
            params.push(filmId, cityId)
        }else if(filmId) {
             query += ' WHERE screenings.film_id = $1'
            params.push(filmId)
        }else if(cityId){
            query += ' WHERE screens.city_id = $1'
            params.push(cityId)
        }

        query += ` ORDER BY screenings.screening_time ASC`

        const result = await pool.query(query, params)

        res.status(200).json({success: true, data: result.rows})
    }catch (error){
        console.error('There was a error while fetching screenings')
        res.status(500).json({success: false, error: 'There was an inside error while fetching screenings'})
    }
    })

    // GET PRICES

    app.get('/api/prices', async (req, res) => {

       try{
         const priceQueryResult = await pool.query(`SELECT * FROM prices`)

        res.status(200).json({success: true, data: priceQueryResult.rows})
       }catch(error){
        console.error('There was an inside error while fetching prices')
        res.status(500).json({success: false, error: 'There was an inside error while fetching prices'})
       }

    })

    
// GET BOOKINGS ||||  NOT READY YET  ||||

    app.get('/api/bookings', async (req, res) => {
        try{
        const screeningId = req.query.screeningId;

        let query = `
        SELECT
        bookings.id AS booking_id,
        screenings.screening_time,
        films.title AS film_title,
        ARRAY_AGG(tickets.seat_id) AS seat_id
        FROM bookings
        JOIN screenings ON bookings.screening_id  = screenings.id
        JOIN films ON screenings.film_id = films.id
        LEFT JOIN tickets ON tickets.booking_id = bookings.id
         `

         let params = [];

         if(screeningId){
            query += ` WHERE bookings.screening_id = $1`;
            params.push(screeningId);
         }

         query += ` GROUP BY bookings.id, screenings.screening_time, films.title`;

         query += ` ORDER BY bookings.id DESC`;

         const result = await pool.query(query, params);

            res.status(200).json({
                success: true,
                data: result.rows
            })

        }catch(error){
            console.log('Error while fetching bookings')
            res.status(500).json({success: false, error: 'an internal error while fetching bookings'})
        }


    })
}

