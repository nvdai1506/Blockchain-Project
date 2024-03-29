﻿/*
 * Title: Blockchain Project
 * Description: Api for the project
 * Author: Mor Cohen
 * Date: 21/9/18
 */


///////////////////////////////////////////////////////////////////////////////////////////////
/*  -Dependencies & Configurations-  */
///////////////////////////////////////////////////////////////////////////////////////////////
const express = require('express');
const app = express();
const bodyParser = require('body-parser'); 
const Blockchain = require('./blockchain'); 
const uuid = require('uuid/v1');//for keys
const uniqid = require('uniqid');//for invitations
const rp = require('request-promise');
var path = require('path');
var validator = require('validator');
const sha256 = require('sha256');
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const http = require('http');
var server = http.createServer(app);
var nodemailer = require('nodemailer');
var forge = require('node-forge');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";//fixing nodemailer

///////////////////////////////////////////////////////////////////////////////////////////////
/*  -Initialize blockchain first time & create a master user-  */
///////////////////////////////////////////////////////////////////////////////////////////////
const backup = new Blockchain();
// const privateKey = uuid().split('-').join(''); //privateKey
// console.log("privateKey: ", privateKey)
// const public_key = sha256(privateKey); //publicKey
// console.log("public_key: ", public_key)
const privateKey = 'b21859a0b1fb11eb8e79d15bfd85b131';
const public_key = '3b87a882b6a9d89e50ecfaa500d46730e082e92caefd7bf7b895d69b2137cfe7';

///////////////////////////////////////////////////////////////////////////////////////////////
/*  -Create a database named "invitationsDB" on first time-  */
///////////////////////////////////////////////////////////////////////////////////////////////
// var url = "mongodb://localhost:27017/invitationsDB";
var url = "mongodb+srv://ochimot:Vandai1506@cluster0.7w7uc.mongodb.net/invitationsDB"
MongoClient.connect(url, function (err, db) {
    if (err) throw err;
    let dbo = db.db("invitationsDB");
    dbo.collection("users").find().toArray(function (err, result) {//check if user collection already exist
        if (err) throw err;
        if (result.length !== 0)
        {
            const master = backup.createNewTransaction(1000000, "system-reward", result[0].key);
            backup.chain[0].transactions.push(master);
            // var newblock= backup.chain[0];
            // mongo.insert_block_into_chain(newblock);
            console.log('Collection already exist');
        }
        else {
            
            const master = backup.createNewTransaction(1000000, "system-reward", public_key);
            backup.chain[0].transactions.push(master);
            // var newblock= backup.chain[0];
            // mongo.insert_block_into_chain(newblock);
            ///////////////////////////////////////////////////////////////////////////////////////////////
            /*  -Alert: the file 'masterKeysForDelete.txt' content need to be deleted after first init-  */
            fs.appendFileSync('masterKeysForDelete.txt', '\nprivateKey: ' + privateKey);
            fs.appendFileSync('masterKeysForDelete.txt', '\npublicKey: ' + public_key);
            /*  -Alert: the file 'masterKeysForDelete.txt' content need to be deleted after first init-  */
            ///////////////////////////////////////////////////////////////////////////////////////////////
            console.log("Database created!");
            dbo.createCollection("users", function (err, res) {
                if (err) throw err;
                console.log("Collection created!");

                let user = {//master user
                    key: public_key,
                    inv: 1000000,
                    availableInvitations: []
                };
                //init first user in db - the master.
                dbo.collection("users").insertOne(user, function (err, res) {
                    if (err) throw err;
                    console.log("master inserted");
                    console.log(db.db("invitationsDB").listCollections());
                    db.close();
                });
            });
        }
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////
/*  -Configurations & server-  */
///////////////////////////////////////////////////////////////////////////////////////////////
app.set('view engine', 'ejs');

const port = process.env.PORT || process.argv[2];

app.use(express.static(path.join(__dirname, 'Front'))); //public
app.use("/styles", express.static(__dirname + '/Front/assets'));//allow css in invitation page (public)

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

var server = app.listen(port, function () {
    console.log('listening to port: ' + port);
});

///////////////////////////////////////////////////////////////////////////////////////////////
/*  -find index of socket | For example : search((socket.id).toString(), nodes);-  */
///////////////////////////////////////////////////////////////////////////////////////////////
function search(nameKey, myArray) {
    for (var i = 0; i < myArray.length; i++) {
        if (myArray[i].socketId === nameKey) {
            return i;
        }
    }
}
////////////////////////////////////////// ~@ -Start socket.io- @~ //////////////////////////////////////////


const nodes = [];
var io = require('socket.io')(server);

/*  -Socket.io-  */
io.on('connection', (socket) => {

    /*  -On connection of socket-  */
    nodes.push(new Blockchain(socket.id));
    socket.emit('PT', backup.pendingTransactions);//emit to that specific socket
    // console.log("io.on(connection), backup.getAllTransactions" );
    // console.log(backup.getAllTransactions());
    socket.emit('Hist',backup.getAllTransactions());
    console.log('New user connected');
    console.log(socket.id);


    /*
    * Title: Broadcast Transanction section
    * Description: Init transaction for every endpoint.
    */
    app.post('/transaction/broadcast', (req, res) => {

        const amount = parseFloat(req.body.amount);
        const newTransaction = nodes[nodes.length-1].createNewTransaction(amount, req.body.sender, req.body.recipient);
        let flag = true;
        let sender = req.body.sender;
        /*  -Authentication: check for valid private key-  */
        if ((sender !== "system-reward") && (sender !== "system-reward: new user") && (sender !== "system-reward: invitation confirmed")) {
            const privateKey_Is_Valid = sha256(req.body.privKey) === req.body.sender;
            if (!privateKey_Is_Valid) {
                flag = false;
                res.json({
                    note: false
                });
            }
            /*  -Authentication: check if user have the require amount of coins for current transaction && if user exist in the blockchain-  */
            const addressData = backup.getAddressData(req.body.sender);
            const addressData1 = backup.getAddressData(req.body.recipient);
            // console.log("addressData: ", addressData);
            // console.log("adsressData1: ", addressData1);
            if (addressData.addressBalance < amount || addressData === false || addressData1 === false) {
                flag = false;
                res.json({
                    note: false
                });
            }
            /*  -Authentication: fields cannot be empty-  */
            if (req.body.amount.length === 0 || amount === 0 || amount < 0 || req.body.sender.length === 0 || req.body.recipient.length === 0) {
                flag = false;
                res.json({
                    note: false
                });
            }
        }
        
        if (amount > 0 && flag === true) {
            var pt = null;
            backup.addTransactionToPendingTransactions(newTransaction);//put new transaction in global object
            nodes.forEach(socketNode => {
                socketNode.addTransactionToPendingTransactions(newTransaction);
                io.clients().sockets[(socketNode.socketId).toString()].pendingTransactions = socketNode.pendingTransactions;//add property to socket
                pt = socketNode.pendingTransactions;
            });
            io.clients().emit('PT', pt);//emit to all sockets
            res.json({
                note: `Transaction complete!`
            });
        }
    });

     /*
    * Title: reward mining
    * Description: reward after successful mining 
    */
    app.post('/mine/reward', (req,res)=>{
        console.log("==/mine/reward");
        const amount = parseFloat(req.body.amount);
        let sender = req.body.sender;
        let recipient = req.body.recipient;
        let blockHash = req.body.blockHash;
        flag =true;
        if(sender === "system-reward")
        {
            sender = '3b87a882b6a9d89e50ecfaa500d46730e082e92caefd7bf7b895d69b2137cfe7';
            const addressData = backup.getAddressData(sender);
            const addressData1 = backup.getAddressData(recipient);
            if (addressData.addressBalance < amount || addressData === false || addressData1 === false) {
                flag = false;
                res.json({
                    note: false
                });
            }
            /*  -Authentication: fields cannot be empty-  */
            if (req.body.amount.length === 0 || amount === 0 || amount < 0 || req.body.sender.length === 0 || req.body.recipient.length === 0) {
                flag = false;
                res.json({
                    note: false
                });
            }

        }
        if(flag === true){
            console.log("==/mine/reward - flag == true ");
            let rewardTransaction = backup.createNewTransaction(amount,sender,recipient);
            backup.addRewardTransactionToBlock(blockHash,rewardTransaction);
            io.clients().emit('Hist',rewardTransaction);
            res.json({
                note: `Transaction complete!`
            });
        }
    });

    /*
    * Title: Miner section
    * Description: user mine the last block of transaction by POW, getting reward and init a new block
    */
    app.get('/mine/:key2', (req, res) => {
        var publickey = req.params.key2;
        const lastBlock = backup.getLastBlock();
        const previousBlockHash = lastBlock['hash'];
        AllTransactions = backup.getAllTransactions();
        io.clients().emit('Hist', AllTransactions);
        
        // console.log("--mine: backup.pendingTransactions: ",AllTransactions);
        const currentBlockData = {
            transactions: backup.pendingTransactions,
            index: lastBlock['index'] + 1
        }
        
        const nonce = backup.proofOfWork(previousBlockHash, currentBlockData);//doing a proof of work
        const blockHash = backup.hashBlock(previousBlockHash, currentBlockData, nonce);//hash the block
        const newBlock = backup.createNewBlock(nonce, previousBlockHash, blockHash);//create a new block with params
        // console.log("--mine: remove_pendingTransaction: ", backup.pendingTransactions);
        
        const requestOptions = {//a promise to make a new block
            uri: backup.currentNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };
        rp(requestOptions)
            .then(data => {//reward the miner after mining succed and new block already created
                
                
                // const requestOptions = {
                //     uri: backup.currentNodeUrl + '/transaction/broadcast',
                //     method: 'POST',
                //     body: {
                //         amount: 12.5,
                //         sender: "system-reward",
                //         recipient: publickey
                //     },
                //     json: true
                // };
                const requestOptions = {
                    uri: backup.currentNodeUrl + '/mine/reward',
                    method: 'POST',
                    body: {
                        blockHash:blockHash,
                        amount: 12.5,
                        sender: "system-reward",
                        recipient: publickey
                    },
                    json: true
                };
                return rp(requestOptions);
            })
            .then(data => {
                res.json({
                    note: "New block mined and broadcast successfully",
                    block: newBlock
                });
            });
    });


    /*
    * Title: receive new block section
    * Description: checking validity of new block.
    */
    app.post('/receive-new-block', (req, res) => {
        const newBlock = req.body.newBlock;
        const lastBlock = backup.getLastBlock();
        const correctHash = lastBlock.hash === newBlock.previousBlockHash;
        const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

        if (correctHash && correctIndex) {
            backup.chain.push(newBlock);
            backup.pendingTransactions = [];
            res.json({
                note: 'New block received and accepted.',
                newBlock: newBlock
            });
        }
        else {
            res.json({
                note: 'New block rejected',
                newBlock: newBlock
            });
        }
    });

    
    /*
    * Title: emitMiningSuccess
    * Description: emit all sockets - a message to all sockets for mining operation succed
    */
    app.get('/emitMiningSuccess', (req, res) => {
        io.clients().emit('mineSuccess', true);//emit to all sockets
    });


    /*
    * Title: pendingTransactions
    * Description: get all pending Transactions
    */
    app.get('/pendingTransactions', (req, res) => {
        const transactionsData = backup.getPendingTransactions();
        // console.log("--/pendingTransactions: ");
        // console.log(transactionsData);
        res.json({
            pendingTransactions: transactionsData
        });
    });
    app.get('/histTransactions', (req, res) => {
        const transactionsData = backup.getAllTransactions();
        // console.log("--/histTransactions: ");
        // console.log(transactionsData);
        res.json({
            histTransactions: transactionsData
        });
    });

    /*
    * Title: Main Blockchain
    * Description: display the whole block chain (Developers Only!)
    */
    app.get('/blockchain', (req, res) => {
        res.send(backup);
    });

    /*
* Title: generateKeyPair
* Description: generateKeyPair
*/
    var keyPair = forge.pki.rsa.generateKeyPair(1024);
    app.get('/generateKeyPair', (req, res) => {
        res.send(keyPair.publicKey);
    });

    /*
    * Title: Authentication Keys
    * Description: Authentication for private and public keys
    */
    app.post('/hashKeys', (req, res) => {
        const k1 = req.body.key1;
        
            //const k1 = keyPair.privateKey.decrypt(req.body.k1);
            //console.log(k1);

            const k2 = req.body.key2;
            const privateKey_Is_Valid = sha256(k1) === k2;

            const addressData = backup.getAddressData(k2);
            if (addressData === false) {
                res.json({
                    note: false
                });
            }

            else if (!privateKey_Is_Valid) {
                res.json({
                    note: false
                });
            }
            else {
                res.json({
                    note: true
                });
            }
        
    });


    /*
    * Title: Send Invitation (INVITE A FRIEND: step 1/3)
    * Description: generate an invitation and send it to recipient email
    */
    app.post('/sendInvitation', (req, res) => {
        let email = req.body.email;//email of recipient
        const senderKey = req.body.sender;//sender ID/Key
        let invitationID = uniqid();//generate invitation ID

        var toChange;//the value that need to be change
        if (validator.isEmail(email.toString())) {
            /*  -Connect to database "invitationsDB"-  */
            MongoClient.connect(url, function (err, db) {
                if (err) throw err;
                console.log("Database connected!");
                let dbo = db.db("invitationsDB");

                let query = { key: senderKey };//query to find

                let promise = new Promise(function (resolve, reject) {
                    dbo.collection("users").find(query).toArray(function (err, result) {//find the sender in db
                        if (err) throw err;
                        toChange = result[0].inv;//set the veriable to the num of avilable invitations 
                        resolve("done!");
                    });
                });
                promise.then(
                    function (result) {
                        if (toChange === 0) {
                            toChange = 0;
                            res.json({
                                note: false,
                                message: 'dismiss - num of invitation is 0'
                            });
                        }
                        else {
                            toChange--;//substruct the num of available invitations
                            let newvalues = { $set: { inv: toChange } };
                            let newInvite = { $push: { availableInvitations: invitationID } };
                            dbo.collection("users").updateOne(query, newvalues, function (err, res1) {//update in db
                                if (err) throw err;
                                console.log(res1.result.nModified + " document(s) updated");
                                dbo.collection("users").updateOne(query, newInvite, function (err, res2) {//update in db
                                    if (err) throw err;
                                    console.log(res2.result.nModified + " document(s) updated");
                                    ///////////////////////////////////////////////////////////////

                                    /*  -going to invitation end point and generate new invitation-  */
                                    const uri = backup.currentNodeUrl + '/invitation/' + invitationID + '/sender=' + senderKey;
                                    const requestOptions = {
                                        uri: uri,
                                        method: 'GET',
                                        json: true
                                    };
                                    rp(requestOptions)
                                        .then(data => {
                                            //
                                        });

                                    /*  -email configurations-  */
                                    var configgmail  = {
                                        host: 'smtp.gmail.com',
                                        port: 465,
                                        secure: true, 
                                        auth: {
                                            user: 'hugedragont@gmail.com',
                                            pass: 'eynvvhehnbqqguio'
                                        }
                                    }
                                    var transporter = nodemailer.createTransport(configgmail);

                                    var mailOptions = {
                                        from: 'D-Coin',
                                        to: email,
                                        subject: 'You have been invited to the D-Coin blockchain network',
                                        text: 'You have received an invitation to the D-Coin blockchain network \n To activate the account, click on the attached link:\n\n' + uri
                                    };

                                    /*  -send the email-  */
                                    transporter.sendMail(mailOptions, function (error, info) {
                                        if (error) {
                                            console.log(error);
                                            console.log(configgmail);
                                            res.json({
                                                note: false
                                            });
                                        }
                                        else {
                                            console.log('Email sent: ' + info.response);
                                            res.json({
                                                note: true,
                                                numOfInv: toChange
                                            });
                                        }
                                    });

                                    ///////////////////////////////////////////////////////////////
                                    db.close();
                                });
                            });

                        }
                    },
                    function (error) {
                        console.log("there was an error");
                    }
                )
            });
        }

        else {
            res.json({
                note: 'not valid email'
            });
        }
        
    });
    
    /*  -Chat: send message to all users-  */
    /*
    * Title: Chat - get new message
    * Description: get a message and emit it to all users
    */
    socket.on('getNewMessage', (message) => {
        //message = message.toString();
        //message = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        io.clients().emit('newMessage', message);
    });

    /*
    * Title: disconnect
    * Description: enabled when user logs off
    */
    socket.on('disconnect', () => {
        console.log(`User: ${socket.id} was disconnected`);
        nodes.splice(search((socket.id).toString(), nodes), 1);
    });

});


/////////////////////////////////////////// ~@ -End socket.io- @~ ///////////////////////////////////////////


///////////////////////////////////////////////////////////////////////////////////////////////
/*  -invitation page (INVITE A FRIEND: step 2/3)-  */
/*  -search the invitation in db => if not found will display error, if found will display the invitation-  */
///////////////////////////////////////////////////////////////////////////////////////////////
app.get('/invitation/:invitationID/sender=:senderID', (req, res) => {

    const invitationID = req.params.invitationID;
    const senderID = req.params.senderID;

    /*  -Connect to database "invitationsDB"-  */
    MongoClient.connect(url, function (err, db) {
        if (err) throw err;
        console.log("Database connected!");
        let dbo = db.db("invitationsDB");

        let query = { key: senderID, availableInvitations: invitationID };//query to find

        dbo.collection("users").find(query).toArray(function (err, result) {//find the sender in db
            if (err) throw err;
            console.log(result);
            if (result.length === 0) {
                res.render(__dirname + '/Front/error.ejs');//respond error page
            }
            else {
                const priK = uuid().split('-').join(''); //privateKey
                const pubK = sha256(priK); //publicKey
                res.render(__dirname + '/Front/invitation.ejs', {//respond invitation page
                    privateKey: priK,
                    publicKey: pubK,
                    invitationID: invitationID,
                    senderID: senderID
                });
            }
            db.close();
        });
    });
});


///////////////////////////////////////////////////////////////////////////////////////////////
/*  -confirm register (INVITE A FRIEND: step 3/3)-  */
/*  -when user press confirm registeration button (del invitation, make transactions to sender and recipient-  */
///////////////////////////////////////////////////////////////////////////////////////////////
app.post('/confirmRegister', (req, res) => {
    const recipient_public_key = req.body.recipient_public_key;
    const invitationID = req.body.invitationID;
    const senderID = req.body.senderID;

    /*  -Connect to database "invitationsDB"-  */
    MongoClient.connect(url, function (err, db) {
        if (err) throw err;
        console.log("Database connected!");
        let dbo = db.db("invitationsDB");

        let query = { key: senderID };//query to find
        //find sender of invitation and make his invitation to unavilable (remove from db)
        dbo.collection("users").find(query).toArray(function (err, result) {//find the sender in db
            if (err) throw err;

            let pullInvite = { $pull: { availableInvitations: invitationID } };
            dbo.collection("users").updateOne(query, pullInvite, function (err, res) {//update in db
                if (err) throw err;
                console.log(res.result.nModified + " document(s) updated");
                db.close();
            });
        });
    });

    /*  -reward new user-  */
    const requestOptions = {
        uri: backup.currentNodeUrl + '/transaction/broadcast',
        method: 'POST',
        body: {
            amount: 100,
            sender: "system-reward: new user",
            recipient: recipient_public_key
        },
        json: true
    };
    rp(requestOptions)
        //reward the sender.
        .then(data => {
            const requestOptions = {
                uri: backup.currentNodeUrl + '/transaction/broadcast',
                method: 'POST',
                body: {
                    amount: 50,
                    sender: "system-reward: invitation confirmed",
                    recipient: senderID
                },
                json: true
            };
            return rp(requestOptions);
        })
        .then(data => {
            /*  -Connect to database "invitationsDB": add user invitations to db-  */
            MongoClient.connect(url, function (err, db) {
                if (err) throw err;
                console.log("Database connected!");
                let dbo = db.db("invitationsDB");

                let user = {
                    key: recipient_public_key,
                    inv: 100,
                    availableInvitations: []
                };
                //init new user in db - the master.
                dbo.collection("users").insertOne(user, function (err, res) {
                    if (err) throw err;
                    console.log("master inserted");
                    db.close();
                });
            });
        });
    res.json({
        note: true
    });
});


///////////////////////////////////////////////////////////////////////////////////////////////
/*  -Getters-  */
///////////////////////////////////////////////////////////////////////////////////////////////

/*  -get block by blockHash-  */
app.get('/block/:blockHash', (req, res) => {
    const blockHash = req.params.blockHash;
    const correctBlock = backup.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});

/*  -get transaction by transactionId-  */
app.get('/transaction/:transactionId', (req, res) => {
    const transactionId = req.params.transactionId;
    const trasactionData = backup.getTransaction(transactionId);
    res.json({
        transaction: trasactionData.transaction,
        block: trasactionData.block
    });
});

/*  -get address by address-  */
app.get('/address/:address', (req, res) => {
    const address = req.params.address;
    const addressData = backup.getAddressData(address);
    res.json({
        addressData: addressData
    });
});

app.get('/Front', (req, res) => {
    res.sendFile('./Front/index.html', { root: __dirname });
});
    
