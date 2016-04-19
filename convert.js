"use strict"
var fs = require("fs")
var jsonfile = require("jsonfile")
var request = require('request')
var jsdom = require('jsdom');
var process = require('process');
var path = require('path');
var feedparser = require('ortoo-feedparser');



var WaitGroup=require('waitgroup');

var wg=new WaitGroup;

process.env.http_proxy='http://127.0.0.1:8787';

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


function extract_dw($){

    var contents=$("#bodyContent div.group > div.longText > p ");

    if (contents.length==0) {
        
        console.log("not found contents");
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

function extract_voa($){

    //var contents=$(".main-content > .content > #article > .articleContent > .zoomMe").children("p");
    var contents=$("#article  div.articleContent div.zoomMe > p ");

    if (contents.length==0) {
        
        console.log("content not found");
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
        'name':'VOA',
        //'url':"http://www.voachinese.com/api/zyyyoeqqvi",
        'url':"http://www.voachinese.com/api/epiqq",

        //'url':"http://127.0.0.1:8089/zyyyoeqqvi",
        'extract_func':extract_voa
    },
    {
        'name':'DW',
        'url':"http://rss.dw.com/rdf/rss-chi-all",
        'extract_func':extract_dw
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


            console.log(name+" :parse new post:"+article.title);

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
                'date_published': (new Date(article.pubdate)).getTime()/1000,
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


    var reqObj={
        uri:thisOne.url,
        proxy:"http://127.0.0.1:8787"
    };

    request(reqObj, function (err, response, body){  

        if (err) {
            
            console.log(thisOne.name+": error:"+err);
            wg.done();
            return;
        }

        feedparser.parseString(body).on('article', function(article){
            var title = name+" "+article.title;

            if(alreadyHave(title)){
                return;
            }
            add_article(name,article,thisOne.extract_func);
        });

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

