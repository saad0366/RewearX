"use strict";
require('dotenv').config();
const {User,UserPreferences,sequelize}=require('../models');
const email=process.env.SEED_ADMIN_EMAIL,password=process.env.SEED_ADMIN_PASSWORD;
if(!email||!password||password.length<12)throw Error('Set SEED_ADMIN_EMAIL and a unique SEED_ADMIN_PASSWORD (at least 12 characters) locally. No default credentials are provided.');
(async()=>{try{await sequelize.authenticate();if(await User.findOne({where:{email}}))throw Error('Account exists; this utility will not modify it.');await sequelize.transaction(async transaction=>{const user=await User.create({name:process.env.SEED_ADMIN_NAME||'ReWearX Admin',email,password,gender:'other',role:'admin',status:'active',isVerified:true},{transaction});await UserPreferences.create({userId:user.id},{transaction});});console.log('Admin created; password is never printed.');}finally{await sequelize.close();}})().catch(()=>{console.error('Admin creation failed; existing accounts were not changed.');process.exitCode=1;});
