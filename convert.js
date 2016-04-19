"use strict"
var feed = require("feed-read");
var fs = require("fs")
var jsonfile = require("jsonfile")
var request = require('request')
var jsdom = require('jsdom');
var process = require('process');
var path = require('path');


process.env.http_proxy='http://127.0.0.1:7777';

var WaitGroup=require('waitgroup');

var wg=new WaitGroup;


var jqueryPath=path.join(__dirname,"jquery.js");

if (fs.accessSync(jqueryPath)) {
    
    console.log(jqueryPath+" not exits,exit");
    return;
}

var jquery = fs.readFileSync(jqueryPath,"utf-8");

var old_data = jsonfile.readFileSync("data.json");

var next_post_id = old_data.next_post_id;

var changed = true;

function alreadyHave(title){

    for (var i in old_data.post){
        if(old_data.post[i].title==title){
            return true;
        }
    }

    return false;

}

var promises = [];

function extract_voa($){

    //var contents=$(".main-content > .content > #article > .articleContent > .zoomMe").children("p");
    var contents=$("#article  div.articleContent div.zoomMe > p ");

    if (contents.length==0) {
        
        console.log("no article id");
        return "";
    }
        
    var res="";
    for (var i in contents){
        var pText = contents[i].outerHTML;
        if (pText!=undefined) {
            res=res+'\n'+pText;
        }
    }

    return res;

}

var feed_func = [
    {
        'name':'voa',
        //'url':"http://www.voachinese.com/api/zyyyoeqqvi",
        'url':"http://www.voachinese.com/api/epiqq",

        //'url':"http://127.0.0.1:8089/zyyyoeqqvi",
        'extract_func':extract_voa
    }
];

function add_article(name,article,extract_func){

    wg.add();

    jsdom.env({
        url:article.link,
        src:[jquery],
        done:function(err,window){
            if (err) {
                wg.done();
                return;
            }

            var $ = window.$;


            console.log("parse new post:"+article.title);

            var body = extract_func($);

            if (body=="") {
                console.log(article.title+" has no content");
                wg.done();
                return;
            }

            console.log(article.title+" collected:"+body);

            var post = {
                'post_id': old_data.next_post_id,
                'title':name+" "+article.title,
                'date_published': (new Date(article.published)).getTime()/1000,
                'body':body
            };

            old_data.post.unshift(post);
            old_data.next_post_id = old_data.next_post_id+1;
            wg.done();
        }
    });
    
}
for(var i in feed_func) {

    var thisOne=feed_func[i];

    var name=thisOne.name;

    //this is neccessery , or wg.Wait may run before any feed parsed
    wg.add();

    console.log("accessing "+thisOne.name+":"+thisOne.url);
    feed(thisOne.url, function(err,articles){
        if (err) {
            console.log(err," skip "+name);
            wg.done();
            return;
        }


        var old_first = articles.reverse();

        for(var i in old_first){

            var article = articles[i];

            var title = name+" "+article.title;

            if(alreadyHave(title)){
                break;
            }
            add_article(name,article,thisOne.extract_func);
        }

        wg.done();

    });
}


wg.wait(function(){
    console.log("called all ");
    if (changed) {
        old_data.modified = (new Date).getTime()/1000;
        jsonfile.writeFileSync('new_data.json',old_data,{spaces:2});
        console.log("write new file to new_data.json");
    }else{
        console.log("unchanged");
    }
});

