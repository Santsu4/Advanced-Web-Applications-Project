

import pkg from 'pg';
const {Pool} = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});


export default function(app) {



//GET SEATS

    app.get('/api/seats', async (req, res) => {
        try{ 
            const screeningId = req.query.screeningId

            const seatsResult = await pool.query('SELECT * FROM seats ')
            let seats = seatsResult.rows

            let bookedSeatsIds = []

            if(screeningId){
               const bookedResult = await pool.query(`
                SELECT tickets.seat_id
                FROM tickets
                JOIN bookings ON tickets.booking_id = bookings.id
                WHERE bookings.screening_id = $1` ,
                 [screeningId])
               

            bookedSeatsIds = bookedResult.rows.map(row => row.seat_id)
            }

            seats = seats.map(seat =>{
                return{
                    ...seat,
                    isBooked: bookedSeatsIds.includes(seat.id),
                    isReservedByCeo: seat.is_ceo_reserved
                }
            })
        

            res.status(200).json({success: true, data: seats});

        }catch (error){
            console.error('There was error fetching the seats')
            res.status(500).json({success: false, error: 'There was a inside error while fetching the Seat data'})
        }
    })

//Get Layout

    app.get('/api/layouts', async (req, res) =>{
        try{
            const screenId = req.query.screenId;
            const cityId = req.query.cityId
            let query;

            if(screenId){
                query = await pool.query(`SELECT * FROM screens WHERE id = $1`, [screenId])
            
            } else if(cityId){
                query = await pool.query(`SELECT * FROM screens WHERE city_id = $1`, [cityId])
            } else {
                query = await pool.query(`SELECT * FROM screens`)
            }

            res.status(200).json({success: true, data: query.rows})
        }catch(error){
            console.error('There was error while fetching layouts')
            res.status(500).json({success: false, error: 'There was an inside error while fetching layouts'})
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
        screens.city_id
        FROM screenings
        JOIN films on screenings.film_id = films.Id
        JOIN screens on screenings.screen_id = screens.Id
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


    app.get('/api/prices', async (req, res) => {

       try{
         const priceQueryResult = await pool.query(`SELECT * FROM prices`)

        res.status(200).json({success: true, data: priceQueryResult.rows})
       }catch(error){
        console.error('There was an inside error while fetching prices')
        res.status(500).json({success: false, error: 'There was an inside error while fetching prices'})
       }

    })

}