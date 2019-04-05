// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
var app = express();
var server = http.Server(app);
var io = socketIO(server);
app.set('port', 5002);
app.use('/static', express.static(__dirname + '/static'));

// Routing
app.get('/', function(request, response) {
  response.sendFile(path.join(__dirname, 'index.html'));
});

// Starts the server.
server.listen(5002, function() {
  console.log('Starting server on port 5002');
});

// INIT VARIABLES
var cwidth = 800;
var cheight = 600;

var states = {
  "waiting":0,
  "playing":1,
  "scoreboard":2,
}
Object.freeze(states);

var rooms = {};

// MAKES RANDOM ID
function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 4; i++)
  {text += possible.charAt(Math.floor(Math.random() * possible.length))};
  return text;
}

// ITERATES THROUGH ALL ROOMS
/*
for(var rmnm in rooms){
  var room = rooms[rmnm];
  if(room.state = states.waiting){

  }
}*/

// CREATE TEAMS FUNCTION
function makeTeams(room){
  // CLEARS TEAMS
  room.blue.length = 0;
  room.red.length = 0;

  for(var i = 0; i < room.players.length; i ++){
    // ITERATES ALL PLAYER OBJECTS IN ROOM USING
    // ID FROM ROOM'S PLAYER ARRAY
    var player = players[room.players[i]];

    // IF PLAYER HAS UNDECLARED TEAM
    if(player.team === "undeclared"){
      // CHECKS WHICH TEAM IS BIGGER
      if(room.blue.length <= room.red.length){
        player.team = 'blue';
      } else {
        player.team = 'red';
      }
    }
    // SORTS PLAYER TEAMS
    if(player.team === 'blue'){// IF BLUE
      room.blue.push({name:player.name, ready:player.ready, })
    } else {
      room.red.push({name:player.name, ready:player.ready, })
    }
  }
}

// SPAWN BALLS
function spawnBalls(rmnm,numBalls){
  var room = rooms[rmnm];
  for(var i = 0; i < numBalls; i++){

    room.balls[i] = new Object();
    var ball = room.balls[i];
    ball.type = 'ball';
    ball.x = cwidth/2;
    ball.dx = 0;
    ball.y = cheight*(1+i)/(numBalls+1);
    ball.dy = 0;
    ball.color = "#00000";
    ball.owner = undefined;
    room.objects['ball'+i.toString()] = ball;
  }
}

// CREATE PLAYER
function createPlayer(player){
  player.type = 'player';
  player.ball = false;
  player.angle = 0;
  player.charge = 1;
  player.charging = false;
  player.speed = 4.5;
  player.speedmax = 4.5;
}

// START GAME
function startGame(rmnm){
  var room = rooms[rmnm];
  room.state = states.playing;
  spawnBalls(rmnm, Math.max(1,Math.floor(room.players.length/2)));

  var blues = room.blue.length;
  var bb = 1;
  var reds = room.red.length;
  var rr = 1;

  for(var i = 0; i < room.players.length; i ++){
    var player = players[room.players[i]];
    room.objects[room.players[i]] = player;

    if(player.team === 'blue'){
      player.x = cwidth*0.25;
      player.y = cheight*bb / (blues+1)
      bb += 1;
      player.color = 'dodgerBlue';
    } else {
      player.x = cwidth*0.75
      player.y = cheight*rr*1 / (reds+1)
      rr += 1;
      player.color = 'tomato';
    }
    createPlayer(player);
  }
  // START ROOM
  io.sockets.in(rmnm).emit('start game',rooms[rmnm]);
  room.stepEmit = stepEmit(rmnm,room.objects);
  room.stepRoom = setInterval(()=>{stepRoom(room);})
}

function endGame(room){
  clearInterval(room.stepEmit);
  delete room;
}

io.on('connection',function(socket){

  // NEW CONNECTION
  socket.on('new connection',function(name){
    playerid = socket.id;
    players[playerid] = new Object();
    players[playerid].name = name;
    players[playerid].rm = 0;
    players[playerid].ready = false;
    players[playerid].team = "undeclared";
  });

  // PLAYER CREATES A ROOM
  socket.on('create',function(){
    // MAKE NEW ROOM ID
    var rmnm = makeid();
      // KEEP GENERATING CODE UNTIL ITS COMPLETELY UNIQUE
    while(typeof rooms[rmnm] != "undefined")
    {rmnm = makeid();}
      // ADD ROOM ID TO ROOM LIST
    var player = players[socket.id]
    rooms[rmnm] = new Object();
    rooms[rmnm].rmnm = rmnm;
    rooms[rmnm].state = states.waiting;

    rooms[rmnm].players = [];
    rooms[rmnm].players.push(socket.id);

    rooms[rmnm].balls = [];
    rooms[rmnm].objects = {}

    rooms[rmnm].blue = [];
    rooms[rmnm].red = [];

    rooms[rmnm].stepPlayers = 0;
    rooms[rmnm].stepBalls = 0;

    makeTeams(rooms[rmnm]);

    player.rm = rmnm;
    socket.join(rmnm);

    io.sockets.in(rmnm).emit('renderRoom',rooms[rmnm]);
  });

  // PLAYER JOINS ROOM
  socket.on('join',function(rmnm){
    // CHECKS IF ROOM EXISTS
    if(rooms[rmnm] && rooms[rmnm].players.length !=10){
      // IF SUCCESSFULLY JOINED ROOM
      var player = players[socket.id];

      player.rm = rmnm;
      rooms[rmnm].players.push(socket.id);
      makeTeams(rooms[rmnm])
      socket.join(rmnm);
      io.sockets.in(rmnm).emit('renderRoom',rooms[rmnm]);

    } else {
      // IF CANNOT JOIN ROOM
      if(!rooms[rmnm])
      {io.to(`${socket.id}`).emit('no room', "Room does not exist!");}
      else
      {io.to(`${socket.id}`).emit('no room', "Room is full!");}
    }
  })

  // WHEN PLAYER IS READY IN LOBBY
  socket.on('player ready',function(){
    player = players[socket.id]
    var rmnm = player.rm;

    // TOGGLES READY VARIABLE CHANGE
    if(rooms[rmnm].states === states.menu){
      player.ready ? player.ready = false : player.ready = true;
      makeTeams(rooms[rmnm]);
      io.sockets.in(rmnm).emit('renderRoom',rooms[rmnm]);
    }

    // ITERATES THROUGH ALL PLAYERS IN ROOM
    if(player.ready === true){
      for(var i = 0; i < rooms[rmnm].players.length; i ++){
        if(players[rooms[rmnm].players[i]].ready === false)
        {break;} else {
          // IF LAST PLAYER IS READY
          if(i === (rooms[rmnm].players.length - 1))
          {startGame(player.rm);}
        }
      }
    }
  });

  // WHEN PLAYER SWITCH TEAMS
  socket.on('switch teams',function(){
    player = players[socket.id]
    player.team === 'red' ? player.team = 'blue' : player.team = 'red';
    player.ready = false;
    makeTeams(rooms[player.rm]);
    io.sockets.in(player.rm).emit('renderRoom',rooms[player.rm]);
  })

  // WHEN NEW PLAYER JOINS
  socket.on('new player',function(name){
    // CREATE A NEW PLAYER WITH x AND y VARIABLES
    playerid = socket.id;
    players[playerid] = new Object();
    players[playerid].name = name;
    players[playerid].x = 300;
    players[playerid].y = 300;
    players[playerid].color = "#"+((1<<24)*Math.random()|0).toString(16);
    createPlayer(players[playerid]);
  })

  // WHEN PLAYER CLICKS
  socket.on('mouse',function(click){
    var player = players[socket.id] || {};
    switch(click){
      case 0:
        player.charging = true;
        player.ball = false;
        player.charging = false;
        break;
      case 1:
        if(player.ball === true){
          player.charging = true;
        }
        break;
      case 2:
        player.ball = false;
        player.charging = false;
        break;
    }
  })
  // WHEN PLAYER MOVES
  socket.on('input', function(data) {
    var player = players[socket.id] || {};
    // MOVEMENT
    var speed = player.speed/Math.pow(player.charge,1.05);
    if((data.up||data.down)&&(data.left||data.right))
    {speed = 0.7*speed}

    if(data.up    && player.y - speed > 0)            {player.y-=speed}
    if(data.down  && player.y + speed < cheight)      {player.y+=speed}
    if(data.left  && player.x - speed > 0)            {player.x-=speed}
    if(data.right && player.x + speed < cwidth)       {player.x+=speed}

    // DIRECTION FACING
    var distx = data.mouseX - player.x;
    var disty = data.mouseY - player.y;
    //var disty = player.y - data.mouseY;
    player.angle = Math.atan(disty/distx);
    player.angleN = Math.sign(data.mouseX - player.x);
  })

  // WHEN PLAYER LEAVES ROOM
  socket.on('leave room',function(){
    var player = players[socket.id] || {};

    // IF PLAYER IS IN ROOM & ROOM EXISTS AND PLAYER IS LAST ONE
    if(player.rm && rooms[player.rm] && rooms[player.rm].players && rooms[player.rm].players.length == 1){
      endGame(rooms[player.rm]);
      delete rooms[player.rm];
    }

    else if(player.rm && rooms[player.rm]){
      disconnectLobby(player.rm, socket, false)
    }
  });
  // WHEN PLAYER DISCONNECTS SUDDENLY

  socket.on('disconnect',function(){
    var player = players[socket.id] || {};

    // IF PLAYER HAS VARIABLES THEN DELETE THEM
    if(typeof player.charge != undefined){
      player.charge = 0;
      player.ball = false;
    }

    // If player is last player in room, delete room
    if(player.rm && rooms[player.rm] &&rooms[player.rm].players && rooms[player.rm].players.length == 1){
        endGame(rooms[player.rm]);
        delete rooms[player.rm];
      }
    // ELSE IF NOT LAST PERSON IN ROOM
    else if(player.rm && rooms[player.rm]){
      disconnectLobby(player.rm, socket, true);
    }

    // Delete player
    delete players[socket.id];
  })
});

// FUNCTION TO DISCONNECT PLAYER FROM ROOM
function disconnectLobby(rmnm,socket,dc){
  // ITERATES THROUGH ALL PLAYERS IN ROOM
  for(var i = 0; i < rooms[rmnm].players.length; i ++){
    rooms[rmnm].players = rooms[rmnm].players.filter(player => player != socket.id)
  }
  // ITERATES THROUGH ALL OBJECTS IN ROOM
  delete rooms[rmnm].objects[socket.id]

  // RERENDERS FOR ALL PLAYER
  if(rooms[rmnm].state == states.waiting){
    makeTeams(rooms[rmnm]);
    socket.to(rmnm).emit('renderRoom',rooms[rmnm]);
  }

  //
  //if(!dc)
  //{socket.leave(rmnm);}
}

//setInterval(function(){ console.log(rooms)},3000);

                    //////////////////
                    /// GAME LOGIC ///
                    //////////////////

// SENDS DRAW FLAG TO ALL CLIENTS
function stepEmit(rmnm, objects){
  return setInterval(function(){
    io.sockets.in(rmnm).emit('state',objects);
  }, gameSpeed);
}

// INIT LIST OF PLAYERS & BALLS
var players = {};
var gameSpeed = 1000/60;

// STEP BALLS
function stepBalls(ball){
  // CHECKS IF BALL HAS OWNER
  if(ball.owner === undefined){
    // CHECK FOR BALL BOUNCE ON X
    if(ball.x + ball.dx < 0 || ball.x + ball.dx > cwidth){
      ball.dx = -ball.dx;
      ball.dy *= 0.5;
      ball.dx *= 0.5;
    } else {// OTHERWISE FOLLOW SPEED
      ball.x += ball.dx;
      ball.dx *= 0.9985
    }

    // CHECK FOR BALL BOUNCE ON Y
    if(ball.y + ball.dy < 0 || ball.y + ball.dy > cheight){
      ball.dy = -ball.dy;
      ball.dy *= 0.5;
      ball.dx *= 0.5;
    } else { // OTHERWISE FOLLOW SPEED
      ball.y += ball.dy;
      ball.dy *= 0.9985
    }

    // DAMPEN SPEED IF TOTAL SPEED IS LESS THAN 2
    var spd = Math.sqrt(Math.pow(ball.dy,2)+Math.pow(ball.dx,2));
    if(spd < 0.03){
      ball.dy = 0;
      ball.dx = 0;
    }
  // IF BALL DOESNT HAVE OWNER
  } else {
    var player = ball.owner;
    // SET POSITION FOR THE BALL RELATIVE TO DIRECTION PLAYER FACSE
    //ball.x = player.x+ player.angleN*(35*Math.cos(player.angle+(Math.PI/4)+((player.charge-1)*Math.PI/2)));
    ball.x = player.x;
    ball.y = player.y;
    // IF PLAYER JUST THREW THIS BALL
    if(player.ball === false){
      ball.x = player.x+ player.angleN*(50*Math.cos(player.angle));
      ball.y = player.y+ player.angleN*(50*Math.sin(player.angle));
      ball.dx = player.angleN*Math.pow(player.charge,1.15)*Math.cos(player.angle);
      ball.dy = player.angleN*Math.pow(player.charge,1.15)*Math.sin(player.angle);
      ball.owner = undefined;
      player.charge = 1;
    }
  }
}

// STEP PLAYERS
function stepRoom(room){
  var objects = room.objects;
  var balls = room.balls;
  // ITERATES ALL OBJECTS
  for(var id in objects){
    // SETS THE OBJECT AS THE CORRESPONDING ITEM FROM ARRAY
    var object = objects[id];
    // IF ITERATED OBJECT IS IS A PLAYER
    if(object.type === 'player'){
      var player = object;
      // CHARGE UP THROW
      if(player.charging === true){
        if(player.charge < 2){
          player.charge+= 0.00065;
        }
      }
      // CHECK BALL PICKUP
      if(player.ball === false){
        // IF ONE OF THE NUM OF BALLS TOUCHES PLAYER, PLAYER OWNS IT
        // ITERATES THROUGH BALLS
        for(var i = 0; i <  balls.length; i++){

          var ball = balls[i];
          // IF BALL HAS NO OWNER
          if(ball.owner === undefined) {
            if(Math.abs(ball.x - player.x)<30 && Math.abs(ball.y - player.y)<30){
              ball.owner = player;
              player.ball = true;
            }
          }
        }
      }
    } else {
      stepBalls(object);
    }
  }
}
