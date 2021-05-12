
const MongoClient = require('mongodb').MongoClient;
var url = "mongodb+srv://ochimot:Vandai1506@cluster0.7w7uc.mongodb.net/blockchain";

var load_chain = async function(){
    var chain = [];
    var db = await 
    MongoClient.connect(url);
    var dbo = db.db("blockchain");
    var data = await dbo.collection("chain").find().toArray();
    data.forEach(element => {
        chain.push(element);
    });
    db.close();
    console.log(chain);
    return chain;   
}
var insert_block_into_chain = function (newBlock){
    // console.log("new block: ",newBlock);
    // console.log("newBlock.transactions.length: ",newBlock.transactions.length);
    if(newBlock.transactions.length!==0){
        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var dbo = db.db("blockchain");
            dbo.collection("chain").insertOne(newBlock, function(err, res) {
              if (err) throw err;
              console.log("Block is inserted!");
              db.close();
            });
          });
    }
}

function insert_pendingTransaction_into_pendingTransactions(pendingTransaction){
    // if(pendingTransaction.)
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        var dbo = db.db("blockchain");
        dbo.collection("pendingTransactions").insertOne(pendingTransaction, function(err, res) {
          if (err) throw err;
          console.log("pendingTransaction is inserted!");
          db.close();
        });
    });
}
var remove_pendingTransaction = function(transactionID){
    console.log("remove_pendingTransaction: ", transactionID);
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        var dbo = db.db("blockchain");
        var myobj = {"transactionId":transactionID}
        dbo.collection("pendingTransactions").deleteOne(myobj, function(err, obj) {
            if (err) throw err;
            console.log(transactionID," is deleted!");
            db.close();
          });
    });
}



module.exports ={
    "insert_block_into_chain":insert_block_into_chain,
    "insert_pendingTransaction_into_pendingTransactions":insert_pendingTransaction_into_pendingTransactions,
    "remove_pendingTransaction":remove_pendingTransaction,
    "load_chain":load_chain
}