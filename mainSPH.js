/*jshint debug: true, camelcase: true, devel: true, nocomma: false, esversion: 6, plusplus: true, quotmark: double, undef: true, browser: true, moz: true*/
/*globals Vector2, params, addSettings*/


const canvas = document.getElementById("display");
const ctx = canvas.getContext("2d");
const delta = 0.004; //delta is the timestep, used to slow everything down

var isMouseDown = false;

var state = "fluid"; //what state the player is currently in (solid, powder, fluid, interact, remove)
var holdState = "fluid"; //what state the particles will be created in (powder or fluid)
var holdSolid = false; //stores the current a "ghost solid"
var matrix = []; //stores all particles in a lookup index
var series = []; //stores all particles - for quick access
var solids = []; //stores all current solids

var holdMousePos = new Vector2(0,0);
var mousePos = new Vector2(0,0);

document.addEventListener("contextmenu", respondToClicks);
document.addEventListener("mousedown", mouseDown);
document.addEventListener("mouseup",mouseUp);
document.addEventListener("mousemove",moveMouse);
document.addEventListener("click",respondToClicks);

document.getElementById("solid").addEventListener("click",updateState);
document.getElementById("powder").addEventListener("click",updateState);
document.getElementById("fluid").addEventListener("click",updateState);
document.getElementById("interact").addEventListener("click",updateState);
document.getElementById("remove").addEventListener("click",updateState);


function clearMatrix() {
	//every frame, this function is run: the matrix is redrawn completely blank
	
	matrix = [];
	for (let i = 0; i < 192; i += 1) {
		matrix[i] = [];
		for (let j = 0; j < 108; j += 1) {
			matrix[i][j] = [];
    	}
	}
	
	//every single particle is put back into the matrix - it may be somewhat inefficient, but it's more efficient than other methods I trialed
	series.forEach(function(m) {
		m.index = getMatrixLoc(m.pos);
		matrix[m.index.x][m.index.y].push(m);
	});
}

 params.clearAll = function () {
	clearMatrix();
	series = [];
	solids = [];
	holdSolid = false;
};

params.damBreak = function () {
	//creates a block of particles in the center of the screen
	for (let i = 160; i >= 0; i -= 5) {
		for (let j = 0; j < 100; j += 5) {
			series.push(new particle(j + 430 + ((Math.random() - 0.5) * 4), i + 360 + ((Math.random() - 0.5) * 4)));
		}
	}
};

function solid(startPos) {
	this.startPos = startPos;
	this.endPos = Object.assign({},this.startPos);
	this.colour = Object.assign({},params.colour);
}

function particle(xPos,yPos) {
	this.id = series.length;
	this.pos = new Vector2(xPos,yPos);
	this.oldPos = new Vector2(xPos,yPos);
	this.vel = new Vector2(0,0);
	this.index = getMatrixLoc(this.pos);
	this.particleType = holdState;
	
	this.density = 0;
	this.densityNear = 0;
	this.pressure = 0;
	this.pressureNear = 0;
	this.mass = 2.2 - params.mass;
	this.elasticity = params.elasticity;
	this.friction = params.friction;
	this.viscosity = params.viscosity;
	this.colour = Object.assign({},params.colour); //clones colouring
	this.init = Object.assign({},params.colour);
	this.neighbours = [];
	
	this.render = function() {
		ctx.fillStyle = "hsl(" + this.colour.h + ", " + this.colour.s * 100 + "%, " + this.colour.v * 100 + "%)";
        if (params.particleShape == "Square") {
            ctx.fillRect(this.pos.x - (params.particleSize / 2), this.pos.y - (params.particleSize / 2), params.particleSize, params.particleSize);
        
		} else if (params.particleShape == "Circle") {
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, params.particleSize / 2.5, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fill();
        }
	};
	
	this.enforceBounds = function() {
		//rebounds the particles if they go offscreen
		if (this.pos.x < 2) {
			this.pos.x += (2 - this.pos.x) * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.x *= -1 * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.y *= 1 - (this.friction / 20);
		}
		
		if (this.pos.x > 958) {
			this.pos.x += (958 - this.pos.x) * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.x *= -1 * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.y *= 1 - (this.friction / 20);
		}
		
		if (this.pos.y < 2) {
			this.pos.y += (2 - this.pos.y) * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.y *= -1 * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.x *= 1 - (this.friction / 20);
		}
		
		if (this.pos.y > 538) {
			this.pos.y += (538 - this.pos.y) * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.y *= -1 * clipToRange(1 - this.elasticity,0.1,0.9);
			this.vel.x *= 1 - (this.friction / 20);
		}
		
		let m = this;
		solids.forEach(function(s) {
			let width = s.startPos.x - s.endPos.x;
			let height = s.startPos.y - s.endPos.y;
			var tol = new Vector2(Math.abs(width) - Math.abs(width / 2),Math.abs(height) - Math.abs(height / 2));
			
			if (m.pos.x > s.startPos.x + 4 && m.pos.y > s.startPos.y + 4) {
				if (m.pos.x < s.endPos.x - 4 && m.pos.y < s.endPos.y - 4) {
					if (m.pos.y > s.startPos.y - 4 && m.pos.y < s.startPos.y + tol.y) {
						m.pos.y += (s.startPos.y - 4 - m.pos.y) * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.y *= -1 * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.x *= 1 - (m.friction / 20);
					} 

					if (m.pos.y < s.endPos.y + 4 && m.pos.y > s.endPos.y - tol.y) {
						m.pos.y += (s.endPos.y + 4 - m.pos.y) * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.y *= -1 * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.x *= 1 - (m.friction / 20);
					}
					if (m.pos.x > s.startPos.x - 4 && m.pos.x < s.startPos.x + tol.x) {
						m.pos.x += (s.startPos.x - 4 - m.pos.x) * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.x *= -1 * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.y *= 1 - (m.friction / 20);
					} 

					if (m.pos.x < s.endPos.x + 4 && m.pos.x > s.endPos.x - tol.x) {
						m.pos.x += (s.endPos.x + 4 - m.pos.x) * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.x *= -1 * clipToRange(1 - m.elasticity, 0.1, 0.9);
						m.vel.x *= 1 - (m.friction / 20);
					}
				}
			} 
		});
		
		//updates matrix location
		this.index = getMatrixLoc(this.pos);
	};
}

function applyViscosity(m,n) {
	let rij = Vector2.subtract(n.pos,m.pos); //the difference between their positions
	let rij_ = Vector2.magnitude(rij); //the absolute value, or magnitude - basically the distance between their positions
	let rijN = Vector2.normalize(rij); //the unit vector of the position difference
	let q = rij_ / params.smoothingRadius; //value from 0 to 1 that represents how close the particles are

	if (q < 1) {
		if (m.particleType == "fluid") {
			let u = Vector2.multiply(rijN,(n.vel - m.vel)); //relative velocity
			if (u > 0) {
				//shift is the change in velocity due to the viscosity; the velocity spreads out over neighbours
				let shift = Vector2.divide(Vector2.multiply(rijN,delta * (1 - q) * (m.viscosity * u)),2);

				//we reduce our velocity and add to the neighbour's velocity
				m.vel = Vector2.subtract(m.vel,shift);
				n.vel = Vector2.add(n.vel,shift);
			}
		}
	}
}

function doubleDensityRelaxation(m,n,dx) {
	let rij = Vector2.subtract(n.pos,m.pos);
	let rij_ = Vector2.magnitude(rij);
	let rijN = Vector2.normalize(rij);
	let q = rij_ / params.smoothingRadius;
	if (q < 1) {
		if (m.particleType == "fluid") {
			//the following formula is split into two lines for readability, and can be read (in full) as:
			//D = delta^2 * (pressure * (1 - q) + pressureNear * (1 - q)^2) * rijN
			let totalMass = m.mass + n.mass;
			let mMass = (m.mass / totalMass) * 4;
			let nMass = (n.mass / totalMass) * 4;
			let displaceInt = Math.pow(delta,2) * ((1 - q) * m.pressure) + (Math.pow(1 - q),2) * m.pressureNear;
			let displace = Vector2.multiply(rijN,displaceInt);
			n.pos = Vector2.add(n.pos,Vector2.divide(displace,mMass)); //we apply the displacement
			dx = Vector2.subtract(dx,Vector2.divide(displace,nMass)); //and update the displacement
		}
	}
	return dx;
}

function getNeighbours(index) {
	//searches the neighbouring eight cells for particles, then adds them
	let neighbours = [];
	for (let i = -8; i <= 8; i += 1) {
		for (let j = -8; j <= 8; j += 1) {
			if (!(index.x + i > 191 || index.x + i < 0 || index.y + j > 107 || index.y + j < 0)) {
				if (matrix[index.x + i][index.y + j].length >= 1) {
					for (let k = 0; k < matrix[index.x + i][index.y + j].length; k += 1) {
						//cells may hold multiple particles, so it checks for those too
						neighbours.push(matrix[index.x + i][index.y + j][k]);
					}
				}
			}
		}
	}
	return neighbours;
}

function getMatrixLoc(pos) {
	//finds index by dividing the position by 5 and rounding to an integer within the matrix sizes
	let newIndex = new Vector2(Math.round(clipToRange(pos.x / 5,0,191)),Math.round(clipToRange(pos.y / 5,0,107)));
	return newIndex;
}

function updateRender() {
	//wipes the canvas clean
	ctx.fillStyle =  "hsl(" + params.canvasColour.h + ", " + params.canvasColour.s * 100 + "%, " + params.canvasColour.v * 100 + "%)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	series.forEach(function (m) {
		m.vel = Vector2.divide(Vector2.subtract(m.pos,m.oldPos),delta); //recalculate velocity with position
		m.vel = new Vector2(clipToRange(m.vel.x,-1000,1000),clipToRange(m.vel.y,-1000,1000)); //limit velocity to 160 pls
		m.render(); //render particles
	});
	
	solids.forEach(function (s) {
		ctx.fillStyle = "hsl(" + s.colour.h + ", " + s.colour.s * 100 + "%, " + s.colour.v * 100 + "%)";
		let width = s.startPos.x - s.endPos.x;
		let height = s.startPos.y - s.endPos.y;
        ctx.fillRect(s.endPos.x,s.endPos.y,width,height); //renders every solid
	});
	
	if (state == "solid" && holdSolid !== false) {
		ctx.fillStyle = "hsla(" + holdSolid.colour.h + ", " + holdSolid.colour.s * 60 + "%, " + holdSolid.colour.v * 80 + "%, 0.5)";
		let width = holdSolid.startPos.x - holdSolid.endPos.x;
		let height = holdSolid.startPos.y - holdSolid.endPos.y;
        ctx.fillRect(holdSolid.endPos.x,holdSolid.endPos.y,width,height); //renders the currently held solid
	}

	if (state != "solid" && params.brushSize > 1) {
		if (mousePos.x < 960 && mousePos.x > 1 && mousePos.y < 540 && mousePos.y > 0) {
			if (params.canvasColour.v < 0.5) {
				ctx.strokeStyle = "#EAEAEA";
			} else {
				ctx.strokeStyle = "#141414";
			}
			ctx.lineWidth = 2;
			ctx.beginPath();
				ctx.arc(mousePos.x + 3,mousePos.y + 3,params.brushSize / 2,0,2 * Math.PI);
			ctx.closePath();
			ctx.stroke(); //draws a brush around the mouse cursor
		}
	}
}

function updateState(newState) {
	state = newState.srcElement.id;
	holdSolid = false;
	if (state == "powder" || state == "fluid") {
		holdState = state;
	}
}

function moveMouse(event) {
	let rect = canvas.getBoundingClientRect();
	mousePos = new Vector2(event.clientX - rect.left - 5,event.clientY - rect.top - 5);
	if ((mousePos.x > 0 && mousePos.x < 960) && (mousePos.y > 0 && mousePos.y < 540)) {
		userInteract(event);
	} else {
		isMouseDown = false; //the mouse is set to be no longer down if it leaves the canvas area
		if (holdSolid !== false) {
			if (holdSolid.startPos.x > holdSolid.endPos.x) {
				let temp = holdSolid.startPos.x;
				holdSolid.startPos.x = holdSolid.endPos.x;
				holdSolid.endPos.x = temp;
			}
			
			if (holdSolid.startPos.y > holdSolid.endPos.y) {
				let temp = holdSolid.startPos.y;
				holdSolid.startPos.y = holdSolid.endPos.y;
				holdSolid.endPos.y = temp;
			}
			solids.push(holdSolid);
			holdSolid = false;
		}
	}
}

function mouseDown(event) {
	isMouseDown = true;
	if (state == "solid" && holdSolid === false) {
		let rect = canvas.getBoundingClientRect();
		holdMousePos = new Vector2(event.clientX - rect.left - 5,event.clientY - rect.top - 5);
		holdSolid = new solid(holdMousePos);
		//if the mouse is down and we are in solid mode, if there's not already a solid, it adds one
	}
	userInteract(event);
}

function mouseUp(event) {
	isMouseDown = false;
	if (state == "solid" && holdSolid !== false) {
		let rect = canvas.getBoundingClientRect();
		if ((mousePos.x > 0 && mousePos.x < 960) && (mousePos.y > 0 && mousePos.y < 540)) {
			holdSolid.endPos = new Vector2(clipToRange(mousePos.x,0,960),clipToRange(mousePos.y,0,540));
			solids.push(holdSolid);
			if (holdSolid.startPos.x > holdSolid.endPos.x) {
				let temp = holdSolid.startPos.x;
				holdSolid.startPos.x = holdSolid.endPos.x;
				holdSolid.endPos.x = temp;
			}
			
			if (holdSolid.startPos.y > holdSolid.endPos.y) {
				let temp = holdSolid.startPos.y;
				holdSolid.startPos.y = holdSolid.endPos.y;
				holdSolid.endPos.y = temp;
			}
			holdSolid = false;
			//if the mouse goes up and there is currently a ghost solid, it adds it as a permament solid
		}
	}
}

function respondToClicks(event) {
	isMouseDown = true;
	userInteract(event);
	isMouseDown = false;
	if (event.button == 2) {
		event.preventDefault(); //prevents context menu from appearing
	}
}

function userInteract(event) {
	let rect = canvas.getBoundingClientRect();
	mousePos = new Vector2(event.clientX - rect.left - 5,event.clientY - rect.top - 5); //gets mouse position, offset by canvas position
	if (isMouseDown === true) {
		if (state == "solid" && holdSolid !== false) {
			if (event.button === 0) {
				holdSolid.endPos = new Vector2(clipToRange(mousePos.x,0,960),clipToRange(mousePos.y,0,540));
			} else if (event.button == 2) {
				solids.forEach(function (s,i) {
					if (mousePos.x > s.startPos.x && mousePos.y > s.startPos.y) {
						if (mousePos.x < s.endPos.x && mousePos.y < s.endPos.y) {
							solids.splice(i,1); //if the right click was pressed, the program looks for a solid overlapping the mouse pos
						}
					}
				});
			}
		}
		if ((mousePos.x >= 0 && mousePos.x <= 960) && (mousePos.y >= 0 && mousePos.y <= 540)) {
			if (state == "powder" || state == "fluid") {
				if (event.button === 0) {
					for (let i = 0; i < params.brushSize / 2; i += 1) {
						//generates a randomised circle of particles around the brush point

						if (series.length == 2000) {
							alert("2000 particles reached. You may experience severe lag!"); //a lot of testers immediately tried spamming, which can crash the program
						}
						
						if (series.length < 3000) {
							let distance = (Math.random() * params.brushSize) / 2;
							let angle = Math.random() * 360;

							let x = (distance * Math.cos(angle)) + mousePos.x;
							let y = (distance * Math.sin(angle)) + mousePos.y;

							if (x > 0 && x < 960 && y > 0 && y < 540) {
								series.push(new particle(x, y)); //if the new particle is within bounds, add it
							}
						} else if (series.length == 3000) {
							alert("Maximum particles reached."); //to prevent spam/lag
						}
					}
				}
			} else if (state == "interact") {
				let createIndex = getMatrixLoc(new Vector2(mousePos.x,mousePos.y));
				let radius = params.brushSize;
				series.forEach(function (t) {
					let distance = Vector2.distance(mousePos,t.pos);
					if (distance < radius) {
						let speed = 0;
						//sets the particle speed based on its distance to the mouse
						if (event.button === 2) {
							speed = ((radius / 5) / Math.pow(distance,2) + 1) * -1000;
							t.density = 0;
							t.densityNear = 0;
						} else {
							speed = ((radius / 5) / Math.pow(distance,2) + 1) * 1000;
						}
						t.vel = Vector2.setLength(Vector2.normalize(Vector2.subtract(t.pos,mousePos)),speed);
						t.pos = Vector2.add(t.pos,Vector2.multiply(t.vel,delta)); //immediately updates position
					}
				});
			} else if (state == "remove") {
				let createIndex = getMatrixLoc(new Vector2(mousePos.x,mousePos.y));
				series.forEach(function (t,i) {
					let distance = Vector2.distance(mousePos,t.pos);
					if (distance < params.brushSize / 2) {
						series.splice(i,1); //check for particles within radius
					}
				});
			}
		} else {
			isMouseDown = false;
		}
	}
	updateRender(); //updates render every time the mouse is moved/clicked
}

function clipToRange(val, min, max) {
	//returns the middle number of a range, effectively "clipping" to that range
    let given = [min,val,max];
	given = given.sort(function(a,b) {return a - b}); //jshint ignore: line
	return given[1];
}

//this is the bulk of the engine, running every 4ms - it's  a little messy, but separating it into functions tends to break the code for some reason
function mainSimulation() {
	series.forEach(function (m) {
		//first, it iterates through all particles
		m.colour = Object.assign({}, m.init); //resets their colour to the starting colour
		
		if (params.wind !== 0) {
			m.vel.x += (params.wind * 1.6) * Math.abs(params.wind * 1.6);
		}
		
		if (params.gravity !== 0) {
			m.vel.y += (params.gravity * 1.6) * Math.abs(params.gravity * 1.6);
		}
		
		m.colour.s += clipToRange(Math.abs((m.vel.x + m.vel.y) * params.satMult * 0.005),0,1); //update saturation based on velocity
		m.neighbours = getNeighbours(m.index); //checks all neighbouring squares of radius 8 for neighbours
		//viscosity code:
		m.neighbours.forEach(function (n) {
			if (m.id < n.id) { //this avoids duplicates
				applyViscosity(m,n);
			}
		});
	});
	
	//density computations
	series.forEach(function (m) {
		//updates the positions of the particles
		m.oldPos = Object.assign({},m.pos);
		m.pos = Vector2.add(m.pos,Vector2.multiply(m.vel,delta));

		//makes sure they don't leave the area
		m.enforceBounds();

		m.density = 0;
		m.densityNear = 0; //resetting density

		m.neighbours.forEach(function (n) {
			let rij_ = Vector2.magnitude(Vector2.subtract(n.pos,m.pos));
			let q = rij_ / params.smoothingRadius; //see above - value from 0 to 1 representing distance

			if (q < 1) { //only proceeds if the particles are close enough to be involved in the kernel
				m.density += Math.pow(1 - q,2); //adds density to own based on distance
				m.densityNear += Math.pow(1 - q,3); //same thing but closer
			}

			//the density of any particle is a quadratic spike kernel, seen here as the sum of (1 - rij / h)^2
		});

		m.pressure = params.stiffness * (m.density - params.restDensity); //restDensity allows for some "give" essentially, but only on far particles
		m.pressureNear = params.stiffnessNear * m.densityNear;
		m.colour.h += clipToRange(Math.abs(m.pressure * m.pressureNear * Math.pow(params.hueMult,1.2)),0,360); //updates hue based on pressure
		m.colour.v += clipToRange(Math.abs(m.density * m.densityNear * params.valMult * 0.12),0,1); //updates value based on pressure

		let dx = new Vector2(0,0);
		m.neighbours.forEach(function (n) {
			if (n != m) { //only proceed if the particles are not the same
				if (m.particleType == "fluid") {
					dx = doubleDensityRelaxation(m,n,dx); //settles the particles down
				} else if (m.particleType == "powder") { //collision code, which does not work properly :(
					let rij = Vector2.subtract(n.pos,m.pos);
					let rijN = Vector2.normalize(rij);
					let vij = Vector2.subtract(n.vel,m.vel);
					let accel = Vector2.dot(vij,rijN);
					let impulse = 2 * accel / (m.mass + n.mass);
					m.vel = Vector2.subtract(m.vel,Vector2.multiply(rijN,impulse * n.mass * delta));
					n.vel = Vector2.add(n.vel,Vector2.multiply(rijN,impulse * m.mass * delta));
				}
			}
			
		});
		if (m.particleType == "fluid") {
			m.pos = Vector2.add(m.pos,dx); //and now, after checking all neighbour displacements, we update our own
		}
	});
	updateRender();
}
	
setInterval(function () {
	clearMatrix(); //runs every 4ms to clear the matrix
	mainSimulation(); //after the matrix is cleared, it can run the simulation for new positions again
}, 4);

addSettings();