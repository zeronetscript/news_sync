"use strict"
var fs = require("fs")
var jsonfile = require("jsonfile")
var request = require('request')
var jsdom = require('jsdom');
var path = require('path');



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


function extract_dw($){

    var contents=$("#bodyContent div.group > div.longText > p ");

    if (contents.length==0) {
        
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

    var contents=$("#article  div.articleContent div.zoomMe > p ");

    if (contents.length==0) {
        
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
	/*
    {
        'name':'VOA',
        'url':"http://www.voachinese.com/api/epiqq",
        'extract_func':extract_voa
    },
    */
    {
        'name':'DW',
        'url':"http://rss.dw.com/rdf/rss-chi-all",
        'extract_func':extract_dw
    }
];

function add_article(name,article,extract_func){

    wg.add();

    jsdom.env({
        url:encodeURI(article.link),
        src:[jquery],
        done:function(err,window){
            if (err) {
                wg.done();
                return;
            }

            var $ = window.$;



            var body = extract_func($);

            if (body=="") {
                wg.done();
                return;
            }


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

var wgCan;

for(var i in feed_func) {

    var thisOne=feed_func[i];

    var name=thisOne.name;

    //this is neccessery , or wg.Wait may run before any feed parsed
    wg.add();

    var FeedParser = require('feedparser');
  
    var feedparser = new FeedParser();


    var req = request (thisOne.url);

    req.on('response',function(res){
	    if (res.statusCode!=200) {
		    console.log(thisOne.name+" error done");
		    wg.done();
		    return;
	    }

	    res.pipe(feedparser);
    });


    feedparser.on('error',function(err){
	    wg.done();
	    console.log("error done:"+err);
    });

    feedparser.on('readable', function(){

        var stream=this;

        var article;
        while(article=stream.read()){
            var title = thisOne.name+" "+article.title;
            if(alreadyHave(title)){
                continue;
            }
            add_article(name,article,thisOne.extract_func);
        }
	
    });

    feedparser.on('end',function(){
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

