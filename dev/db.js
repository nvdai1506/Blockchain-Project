
const MongoClient = require('mongodb').MongoClient;
var url = "mongodb+srv://ochimot:Vandai1506@cluster0.7w7uc.mongodb.net/invitationsDB";

function read_data(database,collection){
    var results=[];
    MongoClient.connect(url, function (err, db) {
        if (err) throw err;
        let dbo = db.db(database);
        dbo.collection(collection).find().toArray(function (err, result){
            if (err) throw err;
            if (result.length !== 0)
            {
                result.forEach(element => {
                    results.push(element);
                });
            }
        });
    });
    return results;
}

module.exports = db

